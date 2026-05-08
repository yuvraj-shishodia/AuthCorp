import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SecurityManager, AuditLogger } from '@/lib/security'
import { loginSchema, validate } from '@/lib/validation'

type UserRecord = {
  id: string
  email: string
  username?: string
  password: string
  name: string
  role: 'admin' | 'investigator' | 'analyst'
  permissions: string[]
  organization: string
}

type LoginAttempt = {
  count: number
  firstAttemptMs: number
  blockedUntilMs: number
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_BLOCK_MS = 15 * 60 * 1000
const loginAttempts = new Map<string, LoginAttempt>()

function getClientIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function getRateLimitKey(ip: string, email: string) {
  return `${ip}:${email.toLowerCase()}`
}

function isRateLimited(key: string, now: number) {
  const entry = loginAttempts.get(key)
  if (!entry) return false
  if (entry.blockedUntilMs > now) return true
  return false
}

function recordFailedAttempt(key: string, now: number) {
  const current = loginAttempts.get(key)
  if (!current || now - current.firstAttemptMs > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, {
      count: 1,
      firstAttemptMs: now,
      blockedUntilMs: 0,
    })
    return
  }

  const nextCount = current.count + 1
  const blockedUntilMs = nextCount >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_BLOCK_MS : 0
  loginAttempts.set(key, {
    count: nextCount,
    firstAttemptMs: current.firstAttemptMs,
    blockedUntilMs,
  })
}

function clearFailedAttempts(key: string) {
  loginAttempts.delete(key)
}

function loadUsersFromEnv(): UserRecord[] {
  const raw = process.env.AUTH_USERS_JSON?.trim()
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((user: any) =>
        user &&
        typeof user.id === 'string' &&
        typeof user.email === 'string' &&
        typeof user.password === 'string' &&
        typeof user.name === 'string' &&
        typeof user.role === 'string' &&
        Array.isArray(user.permissions) &&
        typeof user.organization === 'string'
      )
      .map((user: UserRecord) => ({
        ...user,
        // Allow docker-compose escaped bcrypt hashes (e.g. $$2a$$12$$...) in env files.
        password: user.password.replace(/\$\$/g, '$'),
      }))
  } catch {
    return []
  }
}

export async function POST(request: NextRequest) {
  try {
    const isProduction = process.env.NODE_ENV === 'production'
    const body = await request.json()
    const validated = validate(loginSchema, body)
    const clientIp = getClientIp(request)
    const userAgent = request.headers.get('user-agent') || 'unknown'

    if (!validated.success) {
      await AuditLogger.logAction({
        userId: 'anonymous',
        action: 'login_attempt_failed',
        resource: 'auth',
        details: { reason: 'invalid_input', errors: validated.errors },
        ipAddress: clientIp,
        userAgent,
        riskLevel: 'medium'
      })

      return NextResponse.json(
        { error: 'Invalid input', details: validated.errors },
        { status: 400 }
      )
    }

    const { email, password } = validated.data
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedPassword = password.trim()
    const now = Date.now()
    const rateLimitKey = getRateLimitKey(clientIp, normalizedEmail)

    if (isRateLimited(rateLimitKey, now)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again later.' },
        { status: 429 }
      )
    }

    const users = loadUsersFromEnv()
    if (users.length === 0) {
      return NextResponse.json(
        { error: 'Authentication is not configured' },
        { status: 503 }
      )
    }

    // Input validation
    // Already handled by schema

    // Find user
    const user = users.find((u) => {
      const userEmail = u.email.trim().toLowerCase()
      const userName = (u.username || '').trim().toLowerCase()
      return userEmail === normalizedEmail || userName === normalizedEmail
    })
    if (!user) {
      recordFailedAttempt(rateLimitKey, now)
      await AuditLogger.logAction({
        userId: 'anonymous',
        action: 'login_attempt_failed',
        resource: 'auth',
        details: { reason: 'user_not_found', email: normalizedEmail },
        ipAddress: clientIp,
        userAgent,
        riskLevel: 'medium'
      })

      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(normalizedPassword, user.password)
    if (!isValidPassword) {
      recordFailedAttempt(rateLimitKey, now)
      await AuditLogger.logAction({
        userId: user.id,
        action: 'login_attempt_failed',
        resource: 'auth',
        details: { reason: 'invalid_password', email: normalizedEmail },
        ipAddress: clientIp,
        userAgent,
        riskLevel: 'high'
      })

      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }
    clearFailedAttempts(rateLimitKey)

    // Generate JWT token
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      organization: user.organization
    }

    const token = SecurityManager.generateToken(tokenPayload, '24h')

    // Log successful login
    await AuditLogger.logAction({
      userId: user.id,
      action: 'login_successful',
      resource: 'auth',
      details: { email: normalizedEmail, role: user.role },
      ipAddress: clientIp,
      userAgent,
      riskLevel: 'low'
    })

    // Return user data (excluding password)
    const { password: _, ...userWithoutPassword } = user

    const response = NextResponse.json({
      success: true,
      user: userWithoutPassword
    })

    // Set secure, httpOnly session cookie
    response.cookies.set('authcorp_session', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24, // 24h
    })

    return response

  } catch (error) {
    console.error('Login error:', error)
    
    await AuditLogger.logAction({
      userId: 'system',
      action: 'login_error',
      resource: 'auth',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      riskLevel: 'high'
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
