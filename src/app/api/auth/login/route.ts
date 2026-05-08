import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SecurityManager, AuditLogger } from '@/lib/security'
import { loginSchema, validate } from '@/lib/validation'

// Mock user database
const users = [
  {
    id: '1',
    email: 'admin@authcorp.com',
    password: '$2a$12$ocP/GfoKlFTJIyUQNJGmGOnPOQDvpP3n7G.qfqrn0Rwu9eziVLYWy', // 'admin123'
    name: 'Admin User',
    role: 'admin' as const,
    permissions: ['*'],
    organization: 'AuthCorp Corp'
  },
  {
    id: '2',
    email: 'investigator@authcorp.com',
    password: '$2a$12$jEtk6xVa3RO0op4HtVS3julrNwFhBNNXiLrM/.Q8jdbYNmHPpwyhO', // 'investigator123'
    name: 'John Investigator',
    role: 'investigator' as const,
    permissions: ['document:analyze', 'risk:check', 'report:generate'],
    organization: 'Law Enforcement'
  },
  {
    id: '3',
    email: 'analyst@authcorp.com',
    password: '$2a$12$69.Y230ObjSdPzEWiTwfWe/1w/dBTt9Cg6ZP7WwAByX0T0.yPKbAC', // 'analyst123'
    name: 'Jane Analyst',
    role: 'analyst' as const,
    permissions: ['document:analyze', 'report:view'],
    organization: 'Financial Services'
  }
]

export async function POST(request: NextRequest) {
  try {
    const isProduction = process.env.NODE_ENV === 'production'
    const body = await request.json()
    const validated = validate(loginSchema, body)
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown'
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

    // Input validation
    // Already handled by schema

    // Find user
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase())
    if (!user) {
      await AuditLogger.logAction({
        userId: 'anonymous',
        action: 'login_attempt_failed',
        resource: 'auth',
        details: { reason: 'user_not_found', email },
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
    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      await AuditLogger.logAction({
        userId: user.id,
        action: 'login_attempt_failed',
        resource: 'auth',
        details: { reason: 'invalid_password', email },
        ipAddress: clientIp,
        userAgent,
        riskLevel: 'high'
      })

      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

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
      details: { email, role: user.role },
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