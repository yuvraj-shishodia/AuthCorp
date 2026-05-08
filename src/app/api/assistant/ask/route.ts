import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { SecurityManager, AuditLogger } from '@/lib/security'
import { generateAssistantResponse, type AssistantContextSnapshot } from '@/lib/assistant-engine'
import { getAssistantRuntimeStatus } from '@/lib/assistant-runtime'

const askSchema = z.object({
  prompt: z.string().min(1).max(2000),
  context: z.any().optional()
})

async function callOpenAI(
  prompt: string,
  context: AssistantContextSnapshot,
  contextSummary: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const systemPrompt = `You are AuthCorp's forensic document analysis AI assistant. You help investigators analyze documents for authenticity, forgery, deepfakes, and fraud.

Current platform context:
${contextSummary}

${context.document ? `Active document: ${JSON.stringify(context.document, null, 2)}` : 'No document currently selected.'}
${context.stats ? `Live stats: ${JSON.stringify(context.stats)}` : ''}
${context.health ? `System health: ${JSON.stringify(context.health)}` : ''}

Guidelines:
- Be concise and analytical. Investigators are professionals.
- Reference specific scores, confidence values, and findings from the context.
- If asked about features not yet active (live blockchain anchoring, etc.), acknowledge them honestly.
- Never make up forensic findings that aren't in the context.
- Format responses in plain text — no markdown headers in your reply.`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 600,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`OpenAI error ${response.status}: ${err?.error?.message || response.statusText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || 'No response from AI provider.'
}

export async function POST(req: NextRequest) {
  try {
    const session = cookies().get('authcorp_session')?.value
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const user = SecurityManager.verifyToken(session)

    const body = await req.json()
    const parsed = askSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
    }

    const { prompt, context } = parsed.data
    const assistantContext = (context || {}) as AssistantContextSnapshot
    const runtimeStatus = getAssistantRuntimeStatus()

    // Build context summary for OpenAI
    const { buildAssistantContextSummary } = await import('@/lib/assistant-engine')
    const contextSummary = buildAssistantContextSummary(assistantContext)

    let replyText: string
    let usedProvider = runtimeStatus.mode

    if (runtimeStatus.mode === 'openai') {
      try {
        replyText = await callOpenAI(prompt, assistantContext, contextSummary)
      } catch (openAiError) {
        console.error('OpenAI call failed, falling back to local:', openAiError)
        const localResponse = generateAssistantResponse(prompt, assistantContext)
        replyText = localResponse.reply + '\n\n[Note: AI provider temporarily unavailable — using local analysis.]'
        usedProvider = 'local-contextual'
      }
    } else {
      const localResponse = generateAssistantResponse(prompt, assistantContext)
      replyText = localResponse.reply
    }

    const localResponse = generateAssistantResponse(prompt, assistantContext)

    await AuditLogger.logAction({
      userId: user.userId || 'unknown',
      action: 'assistant_query',
      resource: 'assistant',
      details: {
        promptLength: prompt.length,
        topic: localResponse.topic,
        providerMode: usedProvider,
        hasDocumentContext: Boolean(assistantContext.document),
      },
      riskLevel: 'low'
    })

    return NextResponse.json({
      reply: replyText,
      topic: localResponse.topic,
      confidence: localResponse.confidence,
      followUps: localResponse.followUps,
      summary: localResponse.summary,
      providerMode: usedProvider,
      providerLabel: runtimeStatus.providerLabel,
      providerReady: runtimeStatus.ready,
      providerMessage: runtimeStatus.message,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Assistant error', message: String(err) }, { status: 500 })
  }
}
