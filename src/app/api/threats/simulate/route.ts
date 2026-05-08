import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { SecurityManager, AuditLogger } from '@/lib/security'

const simulateSchema = z.object({
  scenario: z.enum(['phishing', 'deepfake', 'document_forgery', 'insider_misuse']),
  intensity: z.number().min(1).max(10).default(5),
  target: z.string().min(2).max(64)
})

export async function POST(req: NextRequest) {
  try {
    const session = cookies().get('authcorp_session')?.value
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const user = SecurityManager.verifyToken(session)

    const body = await req.json()
    const parsed = simulateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
    }

    const { scenario, intensity, target } = parsed.data
    const riskScore = Math.min(100, Math.round(intensity * (25 + Math.random() * 5)))
    const recommendation = riskScore > 60 ? 'Enable additional verification and rate-limit access.' : 'Maintain standard monitoring.'

    await AuditLogger.logAction({
      userId: user.userId || 'unknown',
      action: 'threat_simulation',
      resource: `scenario:${scenario}`,
      details: { intensity, target, riskScore },
      riskLevel: riskScore > 80 ? 'high' : 'medium'
    })

    return NextResponse.json({ scenario, intensity, target, riskScore, recommendation })
  } catch (err: any) {
    return NextResponse.json({ error: 'Simulation error', message: String(err) }, { status: 500 })
  }
}