import type { RecentActivity, RealTimeStats, SystemHealth } from './data-service'

export type AssistantTopic = 'overview' | 'document' | 'metadata' | 'risk' | 'monitoring' | 'blockchain' | 'setup' | 'fallback'

export interface AssistantContextSnapshot {
  document?: Record<string, any> | null
  stats?: Partial<RealTimeStats> | null
  health?: Partial<SystemHealth> | null
  recentActivity?: Array<Pick<RecentActivity, 'type' | 'document' | 'result' | 'time'>>
}

export interface AssistantSuggestion {
  id: string
  label: string
  prompt: string
  tone: 'blue' | 'emerald' | 'amber' | 'violet'
}

export interface AssistantResponse {
  reply: string
  topic: AssistantTopic
  confidence: number
  followUps: string[]
  summary: string
}

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())

const getDocumentLabel = (document?: Record<string, any> | null) => {
  if (!document) {
    return 'the current workspace'
  }

  if (typeof document.filename === 'string' && document.filename.trim()) {
    return document.filename.trim()
  }

  const documentType = document.classification?.type || document.fileType || document.type
  if (typeof documentType === 'string' && documentType.trim()) {
    return toTitleCase(documentType)
  }

  return 'the current document'
}

const getDocumentType = (document?: Record<string, any> | null) => {
  if (!document) {
    return 'document'
  }

  const documentType = document.classification?.type || document.fileType || document.type
  if (typeof documentType === 'string' && documentType.trim()) {
    return toTitleCase(documentType)
  }

  return 'document'
}

const getAuthSummary = (document?: Record<string, any> | null) => {
  const authenticity = document?.results?.authenticity
  if (!authenticity) {
    return 'authenticity is still pending'
  }

  return `authenticity score ${Math.round(authenticity.score ?? 0)}/100 with ${Math.round(authenticity.confidence ?? 0)}% confidence`
}

const getStatsSummary = (stats?: Partial<RealTimeStats> | null) => {
  if (!stats) {
    return 'No live telemetry yet'
  }

  return `${stats.documentsProcessed ?? 0} processed, ${stats.highRiskFlags ?? 0} high-risk flags, ${stats.activeAnalyses ?? 0} active analyses`
}

const getHealthSummary = (health?: Partial<SystemHealth> | null) => {
  if (!health) {
    return 'health snapshot unavailable'
  }

  return `AI ${health.aiEngine ?? 'unknown'}, database ${health.database ?? 'unknown'}, blockchain ${health.blockchainService ?? 'unknown'}`
}

// Keep the summary short enough to live in the chat UI without reading like a dump.
export function buildAssistantContextSummary(context: AssistantContextSnapshot): string {
  const documentLabel = getDocumentLabel(context.document)
  const documentStatus = context.document?.status || 'unknown'

  return `${documentLabel} • status ${documentStatus} • ${getStatsSummary(context.stats)} • ${getHealthSummary(context.health)}`
}

export function buildAssistantWelcome(context: AssistantContextSnapshot): string {
  const document = context.document

  if (document) {
    const documentLabel = getDocumentLabel(document)
    return `I’m ready to help with ${documentLabel}. Ask me to summarize the authenticity signals, explain the metadata or text findings, interpret the risk score, or suggest the next manual review step.`
  }

  if (context.stats || context.health) {
    return `I’m connected to the live monitoring state. Ask about the current document pipeline, system health, recent activity, or what integrations are ready to be wired later.`
  }

  return 'I’m ready whenever you are. Ask me about the current case, and I’ll keep the answer tied to the live document and monitoring state.'
}

// Suggest prompts that match the current case instead of repeating generic help text.
export function buildAssistantSuggestions(context: AssistantContextSnapshot): AssistantSuggestion[] {
  const suggestions: AssistantSuggestion[] = []
  const seen = new Set<string>()
  const addSuggestion = (label: string, prompt: string, tone: AssistantSuggestion['tone']) => {
    const key = prompt.toLowerCase().trim()
    if (seen.has(key)) {
      return
    }

    seen.add(key)
    suggestions.push({
      id: `${tone}-${suggestions.length + 1}`,
      label,
      prompt,
      tone,
    })
  }

  const document = context.document
  const documentLabel = getDocumentLabel(document)
  const documentType = getDocumentType(document)
  const authenticity = document?.results?.authenticity
  const riskIntelligence = document?.results?.riskIntelligence
  const metadataAnalysis = document?.results?.forensics?.metadataAnalysis
  const textAnalysis = document?.results?.forensics?.textAnalysis
  const stats = context.stats
  const health = context.health

  if (document) {
    addSuggestion(`Summarize ${documentType}`, `Summarize ${documentLabel} and explain the strongest authenticity indicators.`, 'blue')
    addSuggestion('Explain next steps', `What should I review next for ${documentLabel}?`, 'emerald')

    if (metadataAnalysis) {
      addSuggestion('Interpret metadata', `Explain the metadata findings for ${documentLabel}.`, 'violet')
    } else {
      addSuggestion('Ask about metadata', `What metadata checks should I run on ${documentLabel}?`, 'violet')
    }

    if (textAnalysis) {
      addSuggestion('Review text analysis', `Walk me through the text analysis for ${documentLabel}.`, 'amber')
    }

    if (riskIntelligence) {
      addSuggestion('Review risk signal', `Explain the risk intelligence findings for ${documentLabel}.`, 'emerald')
    } else {
      addSuggestion('Review risk signal', `How should I interpret the risk score for ${documentLabel}?`, 'emerald')
    }

    if (authenticity?.category === 'ai-generated' || authenticity?.category === 'tampered') {
      addSuggestion('Why is it flagged?', `Why is ${documentLabel} flagged as ${authenticity.category}?`, 'amber')
    }
  } else {
    addSuggestion('Summarize monitoring', 'Summarize the current monitoring state.', 'blue')
    addSuggestion('Explain setup', 'What do I need to configure to make the assistant fully provider-driven later?', 'emerald')
    addSuggestion('Recent activity', 'Summarize the latest recent activity.', 'violet')
  }

  if ((stats?.highRiskFlags ?? 0) > 0) {
    addSuggestion('Explain high risk flags', `Explain the current high-risk flags (${stats?.highRiskFlags ?? 0}) in plain language.`, 'amber')
  }

  if ((stats?.documentsProcessed ?? 0) > 0) {
    addSuggestion('Platform overview', `Give me a quick overview of the current platform telemetry.`, 'blue')
  }

  if (health?.aiEngine && health.aiEngine !== 'online') {
    addSuggestion('Service health', `Why is the AI engine currently ${health.aiEngine}?`, 'amber')
  }

  if ((context.recentActivity?.length ?? 0) > 0) {
    addSuggestion('Explain recent activity', 'Summarize the recent activity feed and what it means.', 'violet')
  }

  return suggestions.slice(0, 6)
}

// Handle the obvious intents first so replies stay grounded in the live app state.
export function generateAssistantResponse(prompt: string, context: AssistantContextSnapshot): AssistantResponse {
  const normalizedPrompt = prompt.toLowerCase().trim()
  const document = context.document
  const documentLabel = getDocumentLabel(document)
  const documentType = getDocumentType(document)
  const statsSummary = getStatsSummary(context.stats)
  const healthSummary = getHealthSummary(context.health)
  const authenticity = document?.results?.authenticity
  const metadataAnalysis = document?.results?.forensics?.metadataAnalysis
  const textAnalysis = document?.results?.forensics?.textAnalysis
  const riskIntelligence = document?.results?.riskIntelligence
  const followUps = buildAssistantSuggestions(context)
    .map((suggestion) => suggestion.prompt)
    .filter((suggestionPrompt) => !normalizedPrompt.includes(suggestionPrompt.toLowerCase().slice(0, 18)))
    .slice(0, 3)

  if (
    normalizedPrompt.includes('help') ||
    normalizedPrompt.includes('what can you do') ||
    normalizedPrompt.includes('how do you work')
  ) {
    return {
      reply: `I can summarize the selected document, explain metadata and text analysis, interpret risk signals, describe live monitoring, and suggest the next review step. Right now I’m tied to ${documentLabel} and ${statsSummary}.`,
      topic: 'overview',
      confidence: 0.95,
      followUps,
      summary: buildAssistantContextSummary(context),
    }
  }

  if (normalizedPrompt.includes('monitor') || normalizedPrompt.includes('health') || normalizedPrompt.includes('status')) {
    return {
      reply: `Live monitoring currently reports ${statsSummary}. The system health snapshot is ${healthSummary}.`,
      topic: 'monitoring',
      confidence: 0.94,
      followUps,
      summary: buildAssistantContextSummary(context),
    }
  }

  if (normalizedPrompt.includes('metadata') || normalizedPrompt.includes('exif')) {
    if (metadataAnalysis) {
      const editingSoftware = metadataAnalysis.editingSoftware ? `Editing software: ${metadataAnalysis.editingSoftware}. ` : ''
      const tamperingClues = metadataAnalysis.tamperingClues?.length
        ? `Tampering clues: ${metadataAnalysis.tamperingClues.join(', ')}.`
        : 'No explicit tampering clues were recorded.'

      return {
        reply: `${editingSoftware}Creation date: ${metadataAnalysis.creationDate || 'not available'}. ${tamperingClues}`,
        topic: 'metadata',
        confidence: 0.96,
        followUps,
        summary: buildAssistantContextSummary(context),
      }
    }

    return {
      reply: `I don’t have metadata analysis for ${documentLabel} yet. Once that scan is available, I can explain creation software, timestamps, and tampering clues in plain language.`,
      topic: 'metadata',
      confidence: 0.78,
      followUps,
      summary: buildAssistantContextSummary(context),
    }
  }

  if (normalizedPrompt.includes('signature') || normalizedPrompt.includes('font') || normalizedPrompt.includes('text')) {
    if (textAnalysis) {
      const signatureText = textAnalysis.signatureVerification
        ? `Signature verification is ${textAnalysis.signatureVerification.isValid ? 'valid' : 'flagged'} with ${Math.round(textAnalysis.signatureVerification.confidence ?? 0)}% confidence.`
        : 'No signature verification result is present yet.'
      const alignmentText = textAnalysis.alignmentIssues?.length
        ? `Alignment issues: ${textAnalysis.alignmentIssues.join(', ')}.`
        : 'No alignment anomalies were detected.'

      return {
        reply: `Text analysis for ${documentLabel} shows font consistency at ${Math.round(textAnalysis.fontConsistency ?? 0)}%. ${alignmentText} ${signatureText}`,
        topic: 'document',
        confidence: 0.96,
        followUps,
        summary: buildAssistantContextSummary(context),
      }
    }

    return {
      reply: `I don’t have text analysis for ${documentLabel} yet. Once it is available, I can walk through font consistency, alignment issues, and signature verification.`,
      topic: 'document',
      confidence: 0.77,
      followUps,
      summary: buildAssistantContextSummary(context),
    }
  }

  if (normalizedPrompt.includes('risk') || normalizedPrompt.includes('background') || normalizedPrompt.includes('sanction')) {
    if (riskIntelligence) {
      const findingsCount = riskIntelligence.findings?.length ?? 0
      return {
        reply: `Risk intelligence for ${documentLabel} is ${riskIntelligence.riskCategory || 'unknown'} with a score of ${Math.round(riskIntelligence.personRiskScore ?? 0)}/100 and ${findingsCount} finding${findingsCount === 1 ? '' : 's'}.`,
        topic: 'risk',
        confidence: 0.95,
        followUps,
        summary: buildAssistantContextSummary(context),
      }
    }

    const authenticityScore = authenticity?.score ?? 0
    return {
      reply: `I don’t have a dedicated risk-intelligence payload for ${documentLabel} yet, but the current authenticity score is ${Math.round(authenticityScore)}/100 and the platform currently shows ${statsSummary}.`,
      topic: 'risk',
      confidence: 0.82,
      followUps,
      summary: buildAssistantContextSummary(context),
    }
  }

  if (normalizedPrompt.includes('ai') || normalizedPrompt.includes('deepfake') || normalizedPrompt.includes('generated')) {
    const category = authenticity?.category || 'unknown'
    const score = Math.round(authenticity?.score ?? 0)
    const confidence = Math.round(authenticity?.confidence ?? 0)

    return {
      reply: `The current authenticity analysis for ${documentLabel} is ${category} with a score of ${score}/100 and ${confidence}% confidence. ${document?.results?.heatmap?.suspiciousRegions?.length ? 'A heatmap is available for deeper inspection.' : 'No heatmap regions are available yet.'}`,
      topic: 'document',
      confidence: 0.95,
      followUps,
      summary: buildAssistantContextSummary(context),
    }
  }

  if (normalizedPrompt.includes('blockchain') || normalizedPrompt.includes('anchor') || normalizedPrompt.includes('hash')) {
    return {
      reply: `You can anchor the current hash after generating it from ${documentLabel}. The Blockchain Anchoring page is connected to the configured network list, so once your RPC URLs are set later, the workflow will stay the same.`,
      topic: 'blockchain',
      confidence: 0.89,
      followUps,
      summary: buildAssistantContextSummary(context),
    }
  }

  if (document) {
    const authenticityScore = Math.round(authenticity?.score ?? 0)
    const authenticityCategory = authenticity?.category || 'pending'
    return {
      reply: `${documentLabel} is currently ${document.status || 'unknown'}. The latest authenticity result is ${authenticityCategory} at ${authenticityScore}/100, and the platform telemetry reads ${statsSummary}.`,
      topic: 'document',
      confidence: 0.86,
      followUps,
      summary: buildAssistantContextSummary(context),
    }
  }

  return {
    reply: `No completed document is selected yet. The live platform currently shows ${statsSummary}, while the system health snapshot is ${healthSummary}. You can still ask me how to start a case, what to review first, or which integration is ready to be configured later.`,
    topic: 'fallback',
    confidence: 0.8,
    followUps,
    summary: buildAssistantContextSummary(context),
  }
}