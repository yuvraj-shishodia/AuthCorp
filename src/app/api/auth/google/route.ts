import { NextRequest, NextResponse } from 'next/server'
import { SecurityManager, AuditLogger } from '@/lib/security'
import { googleTokenSchema, validate } from '@/lib/validation'

// Simple in-memory store of known Google accounts
// In production replace with real DB lookup
const knownGoogleAccounts = new Map<string, { id: string; email: string; name: string; role: string; permissions: string[]; organization: string; avatar?: string }>()

export async function POST(request: NextRequest) {
  try {
    const isProduction = process.env.NODE_ENV === 'production'
    const body = await request.json()
    const validated = validate(googleTokenSchema, body)
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    if (!validated.success) {
      return NextResponse.json({ error: 'Invalid input', details: validated.errors }, { status: 400 })
    }

    const { token } = validated.data

    const googleResponse = await fetch(
      `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`
    )

    if (!googleResponse.ok) {
      await AuditLogger.logAction({
        userId: 'anonymous',
        action: 'google_login_failed',
        resource: 'auth',
        details: { reason: 'invalid_google_token' },
        ipAddress: clientIp,
        userAgent,
        riskLevel: 'medium'
      })
      return NextResponse.json({ error: 'Invalid Google token' }, { status: 401 })
    }

    const googleUser = await googleResponse.json()
    const email = googleUser.email?.toLowerCase()

    if (!email) {
      return NextResponse.json({ error: 'Could not retrieve email from Google' }, { status: 400 })
    }

    // Check if this is a sign-up attempt for an already-registered account
    const isSignUp = request.headers.get('x-auth-mode') === 'signup'
    const existing = knownGoogleAccounts.get(email)

    if (isSignUp && existing) {
      return NextResponse.json(
        { error: 'An account with this Google email already exists. Please sign in instead.' },
        { status: 409 }
      )
    }

    // Create or retrieve user
    const user = existing || {
      id: `google_${googleUser.id}`,
      email,
      name: googleUser.name,
      role: 'analyst' as const,
      permissions: ['document:analyze', 'report:view'],
      organization: 'Google SSO',
      avatar: googleUser.picture
    }

    // Store it
    knownGoogleAccounts.set(email, user)

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      organization: user.organization,
      loginMethod: 'google'
    }

    const jwtToken = SecurityManager.generateToken(tokenPayload, '24h')

    await AuditLogger.logAction({
      userId: user.id,
      action: 'google_login_successful',
      resource: 'auth',
      details: { email: user.email, name: user.name },
      ipAddress: clientIp,
      userAgent,
      riskLevel: 'low'
    })

    const response = NextResponse.json({ success: true, user })
    response.cookies.set('authcorp_session', jwtToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24,
    })
    return response

  } catch (error) {
    console.error('Google login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
