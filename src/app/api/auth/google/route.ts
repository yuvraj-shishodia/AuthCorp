import { NextRequest, NextResponse } from 'next/server'
import { SecurityManager, AuditLogger } from '@/lib/security'
import { googleTokenSchema, validate } from '@/lib/validation'

// Simple in-memory store of known Google accounts
// In production replace with real DB lookup
const knownGoogleAccounts = new Map<string, { id: string; email: string; name: string; role: string; permissions: string[]; organization: string; avatar?: string }>()
const googleLoginAttempts = new Map<string, { count: number; firstMs: number; blockedUntilMs: number }>()
const GOOGLE_WINDOW_MS = 15 * 60 * 1000
const GOOGLE_MAX_ATTEMPTS = 10
const GOOGLE_BLOCK_MS = 15 * 60 * 1000

function getClientIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function parseCsvSet(value: string | undefined) {
  return new Set(
    (value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  )
}

function isGoogleRateLimited(key: string, now: number) {
  const entry = googleLoginAttempts.get(key)
  if (!entry) return false
  return entry.blockedUntilMs > now
}

function recordGoogleFailure(key: string, now: number) {
  const current = googleLoginAttempts.get(key)
  if (!current || now - current.firstMs > GOOGLE_WINDOW_MS) {
    googleLoginAttempts.set(key, { count: 1, firstMs: now, blockedUntilMs: 0 })
    return
  }

  const count = current.count + 1
  googleLoginAttempts.set(key, {
    count,
    firstMs: current.firstMs,
    blockedUntilMs: count >= GOOGLE_MAX_ATTEMPTS ? now + GOOGLE_BLOCK_MS : 0,
  })
}

function clearGoogleFailures(key: string) {
  googleLoginAttempts.delete(key)
}

export async function POST(request: NextRequest) {
  try {
    const isProduction = process.env.NODE_ENV === 'production'
    const body = await request.json()
    const validated = validate(googleTokenSchema, body)
    const clientIp = getClientIp(request)
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const rateKey = `${clientIp}:google`
    const now = Date.now()

    if (!validated.success) {
      return NextResponse.json({ error: 'Invalid input', details: validated.errors }, { status: 400 })
    }
    if (isGoogleRateLimited(rateKey, now)) {
      return NextResponse.json({ error: 'Too many login attempts. Try again later.' }, { status: 429 })
    }

    const { token } = validated.data

    const googleResponse = await fetch(
      `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`
    )

    if (!googleResponse.ok) {
      recordGoogleFailure(rateKey, now)
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
      recordGoogleFailure(rateKey, now)
      return NextResponse.json({ error: 'Could not retrieve email from Google' }, { status: 400 })
    }

    const allowedEmails = parseCsvSet(process.env.AUTH_ALLOWED_GOOGLE_EMAILS)
    const allowedDomains = parseCsvSet(process.env.AUTH_ALLOWED_GOOGLE_DOMAINS)
    const domain = email.includes('@') ? email.split('@')[1] : ''

    const explicitlyAllowed = allowedEmails.has(email)
    const domainAllowed = Boolean(domain) && allowedDomains.has(domain)
    const allowAnyGoogle = String(process.env.AUTH_ALLOW_ANY_GOOGLE_USER || '').toLowerCase() === 'true'
    if (!allowAnyGoogle && !explicitlyAllowed && !domainAllowed) {
      recordGoogleFailure(rateKey, now)
      return NextResponse.json({ error: 'Google account is not authorized for this application' }, { status: 403 })
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
    clearGoogleFailures(rateKey)

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
