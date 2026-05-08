import { NextRequest, NextResponse } from 'next/server'
import { SecurityManager } from '@/lib/security'

export async function GET(request: NextRequest) {
  try {
    const cookie = request.cookies.get('authcorp_session')
    if (!cookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const payload = SecurityManager.verifyToken(cookie.value)
    const { userId, email, role, permissions, organization } = payload as any

    return NextResponse.json({
      user: { id: userId, email, name: email.split('@')[0], role, permissions, organization }
    })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
}