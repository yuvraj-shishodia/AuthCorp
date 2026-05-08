#!/usr/bin/env python3
"""
AuthCorp Authentication & Authorization Service
Handles JWT tokens, RBAC, and audit logging
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from functools import wraps
import hashlib

from fastapi import FastAPI, HTTPException, Depends, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import redis.asyncio as redis
import jwt
from cryptography.fernet import Fernet
import bcrypt

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AuthCorp Auth Service", version="1.0.0")

# Security configuration
def require_env(*names: str, default: Optional[str] = None) -> str:
    for name in names:
        value = os.getenv(name)
        if value and value.strip():
            return value.strip()

    if default is not None:
                return default

    raise RuntimeError(f"Missing required environment variable: one of {', '.join(names)}")


SECRET_KEY = require_env("JWT_SECRET", "JWT_SECRET_KEY")
if len(SECRET_KEY) < 32:
    raise RuntimeError("JWT_SECRET must be at least 32 characters long")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
ENCRYPTION_KEY = require_env("ENCRYPTION_KEY")
try:
    Fernet(ENCRYPTION_KEY.encode())
except Exception as exc:
    raise RuntimeError("ENCRYPTION_KEY must be a valid Fernet key") from exc

# Redis configuration
REDIS_URL = require_env("REDIS_URL", default="redis://localhost:6379")
redis_client = None

# Encryption
fernet = Fernet(ENCRYPTION_KEY.encode())

# Security schemes
security = HTTPBearer()

# Models
class User(BaseModel):
    user_id: str
    username: str
    email: str
    roles: List[str] = []
    permissions: List[str] = []
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None

class Role(BaseModel):
    role_id: str
    name: str
    permissions: List[str] = []
    description: str = ""

class Permission(BaseModel):
    permission_id: str
    name: str
    resource: str
    action: str
    description: str = ""

class TokenData(BaseModel):
    user_id: str
    username: str
    roles: List[str] = []
    permissions: List[str] = []
    exp: int

class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = False

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: User

class AuditLog(BaseModel):
    log_id: str
    user_id: str
    action: str
    resource: str
    ip_address: str
    user_agent: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    success: bool = True
    details: Dict = {}

# Mock data (replace with database in production)
USERS_DB = {
    "admin": {
        "user_id": "user_001",
        "username": "admin",
        "email": "admin@authcorp.com",
        "password_hash": bcrypt.hashpw("admin123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
        "roles": ["admin", "investigator"],
        "permissions": ["read", "write", "delete", "admin"],
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_login": None
    },
    "investigator": {
        "user_id": "user_002",
        "username": "investigator",
        "email": "investigator@authcorp.com",
        "password_hash": bcrypt.hashpw("invest123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
        "roles": ["investigator"],
        "permissions": ["read", "write"],
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_login": None
    },
    "analyst": {
        "user_id": "user_003",
        "username": "analyst",
        "email": "analyst@authcorp.com",
        "password_hash": bcrypt.hashpw("analyst123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
        "roles": ["analyst"],
        "permissions": ["read"],
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_login": None
    }
}

ROLES_DB = {
    "admin": {
        "role_id": "role_001",
        "name": "admin",
        "permissions": ["read", "write", "delete", "admin", "manage_users", "manage_roles"],
        "description": "System administrator with full access"
    },
    "investigator": {
        "role_id": "role_002",
        "name": "investigator",
        "permissions": ["read", "write", "generate_reports", "manual_review"],
        "description": "Security investigator"
    },
    "analyst": {
        "role_id": "role_003",
        "name": "analyst",
        "permissions": ["read", "view_reports"],
        "description": "Data analyst with read-only access"
    }
}

PERMISSIONS_DB = {
    "read": {"permission_id": "perm_001", "name": "read", "resource": "*", "action": "read"},
    "write": {"permission_id": "perm_002", "name": "write", "resource": "*", "action": "write"},
    "delete": {"permission_id": "perm_003", "name": "delete", "resource": "*", "action": "delete"},
    "admin": {"permission_id": "perm_004", "name": "admin", "resource": "*", "action": "admin"},
    "generate_reports": {"permission_id": "perm_005", "name": "generate_reports", "resource": "reports", "action": "generate"},
    "manual_review": {"permission_id": "perm_006", "name": "manual_review", "resource": "analysis", "action": "review"},
    "view_reports": {"permission_id": "perm_007", "name": "view_reports", "resource": "reports", "action": "view"},
    "manage_users": {"permission_id": "perm_008", "name": "manage_users", "resource": "users", "action": "manage"},
    "manage_roles": {"permission_id": "perm_009", "name": "manage_roles", "resource": "roles", "action": "manage"}
}

async def get_redis_client():
    """Get Redis client with connection pooling"""
    global redis_client
    if redis_client is None:
        redis_client = redis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
    return redis_client

async def close_redis_connection():
    """Close Redis connection"""
    global redis_client
    if redis_client:
        await redis_client.close()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(user_id: str):
    """Create JWT refresh token"""
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {"user_id": user_id, "type": "refresh", "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenData:
    """Verify JWT token and return token data"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        user_id: str = payload.get("user_id")
        username: str = payload.get("username")
        roles: List[str] = payload.get("roles", [])
        permissions: List[str] = payload.get("permissions", [])
        exp: int = payload.get("exp", 0)
        
        if user_id is None or username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if token is expired
        if exp < time.time():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return TokenData(
            user_id=user_id,
            username=username,
            roles=roles,
            permissions=permissions,
            exp=exp
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def require_permissions(required_permissions: List[str]):
    """Decorator to check if user has required permissions"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, token_data: TokenData = Depends(verify_token), **kwargs):
            user_permissions = set(token_data.permissions)
            required = set(required_permissions)
            
            # Admin has all permissions
            if "admin" in user_permissions:
                return await func(*args, token_data=token_data, **kwargs)
            
            # Check if user has all required permissions
            if not required.issubset(user_permissions):
                missing_perms = required - user_permissions
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing required permissions: {', '.join(missing_perms)}"
                )
            
            return await func(*args, token_data=token_data, **kwargs)
        return wrapper
    return decorator

def require_roles(required_roles: List[str]):
    """Decorator to check if user has required roles"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, token_data: TokenData = Depends(verify_token), **kwargs):
            user_roles = set(token_data.roles)
            required = set(required_roles)
            
            # Check if user has at least one required role
            if not required.intersection(user_roles):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Required one of these roles: {', '.join(required_roles)}"
                )
            
            return await func(*args, token_data=token_data, **kwargs)
        return wrapper
    return decorator

async def log_audit_event(
    user_id: str,
    action: str,
    resource: str,
    request: Request,
    success: bool = True,
    details: Dict = None
):
    """Log audit event to Redis and file"""
    try:
        audit_log = AuditLog(
            log_id=f"audit_{int(time.time() * 1000)}",
            user_id=user_id,
            action=action,
            resource=resource,
            ip_address=request.client.host,
            user_agent=request.headers.get("user-agent", ""),
            success=success,
            details=details or {}
        )
        
        # Store in Redis
        redis_client = await get_redis_client()
        log_key = f"audit:{audit_log.log_id}"
        await redis_client.setex(log_key, 86400 * 30, audit_log.json())  # 30 days retention
        
        # Add to audit log list
        await redis_client.lpush("audit_logs", audit_log.json())
        await redis_client.ltrim("audit_logs", 0, 9999)  # Keep last 10k logs
        
        # Log to file
        logger.info(f"AUDIT: {audit_log.json()}")
        
    except Exception as e:
        logger.error(f"Failed to log audit event: {e}")

# API Endpoints
@app.post("/api/v1/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest, http_request: Request):
    """User login endpoint"""
    try:
        # Find user
        user_data = USERS_DB.get(request.username)
        if not user_data:
            await log_audit_event(
                user_id="unknown",
                action="login_failed",
                resource="auth",
                request=http_request,
                success=False,
                details={"reason": "user_not_found", "username": request.username}
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )
        
        # Verify password
        if not bcrypt.checkpw(request.password.encode('utf-8'), user_data["password_hash"].encode('utf-8')):
            await log_audit_event(
                user_id=user_data["user_id"],
                action="login_failed",
                resource="auth",
                request=http_request,
                success=False,
                details={"reason": "invalid_password"}
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )
        
        # Check if user is active
        if not user_data["is_active"]:
            await log_audit_event(
                user_id=user_data["user_id"],
                action="login_failed",
                resource="auth",
                request=http_request,
                success=False,
                details={"reason": "user_inactive"}
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is inactive"
            )
        
        # Create tokens
        access_token = create_access_token({
            "user_id": user_data["user_id"],
            "username": user_data["username"],
            "roles": user_data["roles"],
            "permissions": user_data["permissions"]
        })
        
        refresh_token = create_refresh_token(user_data["user_id"])
        
        # Update last login
        user_data["last_login"] = datetime.utcnow()
        
        # Log successful login
        await log_audit_event(
            user_id=user_data["user_id"],
            action="login_success",
            resource="auth",
            request=http_request,
            success=True
        )
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=User(**user_data)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@app.post("/api/v1/auth/refresh")
async def refresh_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Refresh access token using refresh token"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        user_id = payload.get("user_id")
        user_data = None
        
        # Find user by ID
        for user in USERS_DB.values():
            if user["user_id"] == user_id:
                user_data = user
                break
        
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        # Create new access token
        access_token = create_access_token({
            "user_id": user_data["user_id"],
            "username": user_data["username"],
            "roles": user_data["roles"],
            "permissions": user_data["permissions"]
        })
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired"
        )
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

@app.get("/api/v1/auth/me", response_model=User)
async def get_current_user(token_data: TokenData = Depends(verify_token)):
    """Get current user information"""
    user_data = None
    for user in USERS_DB.values():
        if user["user_id"] == token_data.user_id:
            user_data = user
            break
    
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return User(**user_data)

@app.post("/api/v1/auth/logout")
async def logout(
    token_data: TokenData = Depends(verify_token),
    request: Request = None
):
    """Logout endpoint"""
    try:
        # Log the logout event
        await log_audit_event(
            user_id=token_data.user_id,
            action="logout",
            resource="auth",
            request=request,
            success=True
        )
        
        # In a production system, you might want to:
        # 1. Blacklist the token
        # 2. Clear session data
        # 3. Notify other services
        
        return {"message": "Logged out successfully"}
        
    except Exception as e:
        logger.error(f"Logout error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@app.get("/api/v1/users", dependencies=[Depends(require_roles(["admin"]))])
async def list_users(token_data: TokenData = Depends(verify_token)):
    """List all users (admin only)"""
    users = []
    for user_data in USERS_DB.values():
        user_dict = user_data.copy()
        user_dict.pop("password_hash", None)  # Remove password hash
        users.append(User(**user_dict))
    
    return {"users": users}

@app.get("/api/v1/roles")
async def list_roles(token_data: TokenData = Depends(verify_token)):
    """List all roles"""
    roles = [Role(**role_data) for role_data in ROLES_DB.values()]
    return {"roles": roles}

@app.get("/api/v1/permissions")
async def list_permissions(token_data: TokenData = Depends(verify_token)):
    """List all permissions"""
    permissions = [Permission(**perm_data) for perm_data in PERMISSIONS_DB.values()]
    return {"permissions": permissions}

@app.get("/api/v1/audit/logs", dependencies=[Depends(require_roles(["admin"]))])
async def get_audit_logs(
    limit: int = 100,
    offset: int = 0,
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    token_data: TokenData = Depends(verify_token)
):
    """Get audit logs (admin only)"""
    try:
        redis_client = await get_redis_client()
        
        # Get recent audit logs from Redis
        all_logs = await redis_client.lrange("audit_logs", 0, -1)
        logs = []
        
        for log_json in all_logs[offset:offset + limit]:
            try:
                log_data = json.loads(log_json)
                
                # Apply filters
                if user_id and log_data.get("user_id") != user_id:
                    continue
                if action and log_data.get("action") != action:
                    continue
                
                logs.append(AuditLog(**log_data))
            except json.JSONDecodeError:
                continue
        
        return {
            "logs": logs,
            "total": len(logs),
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Failed to get audit logs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve audit logs"
        )

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        redis_client = await get_redis_client()
        await redis_client.ping()
        return {"status": "healthy", "service": "auth", "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service unhealthy"
        )

# Middleware for CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware for request logging and security headers
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """Add security headers and log requests"""
    start_time = time.time()
    
    # Add security headers
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    
    # Log request
    process_time = time.time() - start_time
    logger.info(
        f"{request.method} {request.url.path} - {response.status_code} - {process_time:.3f}s"
    )
    
    return response

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("Starting AuthCorp Auth Service...")
    await get_redis_client()
    logger.info("Auth service started successfully")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down AuthCorp Auth Service...")
    await close_redis_connection()
    logger.info("Auth service shut down successfully")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8009)