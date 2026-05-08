import { NextRequest, NextResponse } from 'next/server'

export async function POST(_request: NextRequest) {
  const isProduction = process.env.NODE_ENV === 'production'
  const response = NextResponse.json({ success: true })
  response.cookies.set('authcorp_session', '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
  return response
}