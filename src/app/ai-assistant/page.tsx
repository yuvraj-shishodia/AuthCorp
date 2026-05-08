'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  CpuChipIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LightBulbIcon,
  PaperAirplaneIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useForensics } from '@/components/forensics-provider'
import { dataService, type RealTimeStats, type RecentActivity, type SystemHealth } from '@/lib/data-service'
import {
  buildAssistantContextSummary,
  buildAssistantSuggestions,
  buildAssistantWelcome,
  type AssistantContextSnapshot,
  type AssistantSuggestion,
} from '@/lib/assistant-engine'

type AssistantStatus = {
  mode: 'openai' | 'model-endpoint' | 'local-contextual'
  ready: boolean
  providerLabel: string
  configuredKeys: string[]
  missingKeys: string[]
  message: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  topic?: string
  confidence?: number
  followUps?: string[]
}

const CHAT_STORAGE_KEY = 'authcorp_ai_assistant_messages'

const defaultAssistantStatus: AssistantStatus = {
  mode: 'local-contextual',
  ready: false,
  providerLabel: 'Local contextual mode',
  configuredKeys: [],
  missingKeys: ['OPENAI_API_KEY or AI_MODEL_ENDPOINT'],
  message: 'Loading assistant configuration...',
}

const readStoredMessages = (): ChatMessage[] => {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const stored = window.localStorage.getItem(CHAT_STORAGE_KEY)
    if (!stored) {
      return []
    }

    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to load assistant chat history:', error)
    return []
  }
}

const persistMessages = (messages: ChatMessage[]) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
  } catch (error) {
    console.error('Failed to persist assistant chat history:', error)
  }
}

const formatTimestamp = (value: string) => {
  try {
    return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return value
  }
}

const toneStyles: Record<AssistantSuggestion['tone'], string> = {
  blue: 'from-blue-500/20 to-cyan-500/20 border-blue-400/30 text-blue-100',
  emerald: 'from-emerald-500/20 to-teal-500/20 border-emerald-400/30 text-emerald-100',
  amber: 'from-amber-500/20 to-orange-500/20 border-amber-400/30 text-amber-100',
  violet: 'from-violet-500/20 to-fuchsia-500/20 border-violet-400/30 text-violet-100',
}

export default function AIAssistantPage() {
  const { state } = useForensics()
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [hasSeededWelcome, setHasSeededWelcome] = useState(false)
  const [liveStats, setLiveStats] = useState<RealTimeStats | null>(null)
  const [liveHealth, setLiveHealth] = useState<SystemHealth | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>(defaultAssistantStatus)

  const currentDocument = useMemo(() => {
    const completedDocuments = state.documents.filter((document) => document.status === 'completed')
    return state.activeDocument ?? completedDocuments[completedDocuments.length - 1] ?? state.documents[state.documents.length - 1] ?? null
  }, [state.activeDocument, state.documents])

  const assistantContext = useMemo<AssistantContextSnapshot>(() => ({
    document: currentDocument,
    stats: liveStats,
    health: liveHealth,
    recentActivity: recentActivity.slice(0, 5).map((activity) => ({
      type: activity.type,
      document: activity.document,
      result: activity.result,
      time: activity.time,
    })),
  }), [currentDocument, liveHealth, liveStats, recentActivity])

  const contextSummary = useMemo(() => buildAssistantContextSummary(assistantContext), [assistantContext])
  const welcomeMessage = useMemo(() => buildAssistantWelcome(assistantContext), [assistantContext])
  const promptSuggestions = useMemo(() => buildAssistantSuggestions(assistantContext), [assistantContext])

  useEffect(() => {
    let mounted = true

    const loadLiveData = async () => {
      try {
        const [stats, health, activity, assistantConfig] = await Promise.all([
          dataService.getRealTimeStats(),
          dataService.getSystemHealth(),
          dataService.getRecentActivity(8),
          fetch('/api/assistant/status', { credentials: 'include' })
            .then(async (response) => {
              if (!response.ok) {
                throw new Error('Assistant configuration unavailable')
              }
              return response.json()
            })
            .catch(() => defaultAssistantStatus),
        ])

        if (!mounted) {
          return
        }

        setLiveStats(stats)
        setLiveHealth(health)
        setRecentActivity(activity)
        setAssistantStatus(assistantConfig)
      } catch (loadError) {
        if (mounted) {
          console.error('Failed to load assistant data:', loadError)
          setAssistantStatus(defaultAssistantStatus)
        }
      }
    }

    loadLiveData()

    const unsubscribeStats = dataService.subscribe('stats_updated', (nextStats: RealTimeStats) => {
      if (mounted) {
        setLiveStats(nextStats)
      }
    })

    const unsubscribeHealth = dataService.subscribe('health_updated', (nextHealth: SystemHealth) => {
      if (mounted) {
        setLiveHealth(nextHealth)
      }
    })

    const unsubscribeActivity = dataService.subscribe('activity_updated', (nextActivity: RecentActivity[]) => {
      if (mounted) {
        setRecentActivity(nextActivity)
      }
    })

    return () => {
      mounted = false
      unsubscribeStats()
      unsubscribeHealth()
      unsubscribeActivity()
    }
  }, [])

  useEffect(() => {
    const storedMessages = readStoredMessages()
    setMessages(storedMessages)
    setHasSeededWelcome(storedMessages.length > 0)
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    persistMessages(messages)
  }, [isHydrated, messages])

  useEffect(() => {
    if (!isHydrated || hasSeededWelcome || messages.length > 0) {
      return
    }

    if (!currentDocument && !liveStats && !liveHealth) {
      return
    }

    const seededMessage: ChatMessage = {
      id: `assistant_${Date.now()}`,
      role: 'assistant',
      content: welcomeMessage,
      timestamp: new Date().toISOString(),
      topic: 'overview',
      confidence: 0.94,
      followUps: promptSuggestions.slice(0, 3).map((suggestion) => suggestion.prompt),
    }

    setMessages([seededMessage])
    setHasSeededWelcome(true)
  }, [currentDocument, hasSeededWelcome, isHydrated, liveHealth, liveStats, messages.length, promptSuggestions, welcomeMessage])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  const sendMessage = async (promptOverride?: string) => {
    const prompt = (promptOverride ?? input).trim()
    if (!prompt || isSending) {
      return
    }

    setError(null)

    const requestContext = assistantContext
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    }

    setMessages((previousMessages) => [...previousMessages, userMessage])
    setInput('')
    setIsSending(true)

    try {
      const response = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt,
          context: requestContext,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Assistant error')
      }

      const assistantMessage: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toISOString(),
        topic: data.topic,
        confidence: typeof data.confidence === 'number' ? data.confidence : undefined,
        followUps: Array.isArray(data.followUps) ? data.followUps.slice(0, 3) : promptSuggestions.slice(0, 3).map((suggestion) => suggestion.prompt),
      }

      setMessages((previousMessages) => [...previousMessages, assistantMessage])
    } catch (sendError: any) {
      setError(String(sendError?.message || sendError))
    } finally {
      setIsSending(false)
    }
  }

  const clearChat = () => {
    setMessages([])
    setError(null)
    setHasSeededWelcome(true)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CHAT_STORAGE_KEY)
    }
  }

  const currentDocumentSummary = currentDocument
    ? [
        currentDocument.filename,
        currentDocument.status,
        currentDocument.classification?.type || currentDocument.fileType || 'unknown type',
      ]
        .filter(Boolean)
        .join(' • ')
    : 'No document selected yet'

  const topStats = [
    {
      label: 'Selected document',
      value: currentDocument ? currentDocument.filename : 'None',
      detail: currentDocument ? currentDocumentSummary : 'Use document upload to start a case',
      icon: DocumentTextIcon,
    },
    {
      label: 'Documents processed',
      value: liveStats ? liveStats.documentsProcessed.toLocaleString() : '—',
      detail: liveStats ? `${liveStats.activeAnalyses} active analyses` : 'Loading live telemetry',
      icon: ClockIcon,
    },
    {
      label: 'Risk posture',
      value: liveStats ? `${liveStats.highRiskFlags}` : '—',
      detail: liveStats ? `${liveStats.systemStatus} system status` : 'Waiting for live status',
      icon: ExclamationTriangleIcon,
    },
    {
      label: 'Assistant mode',
      value: assistantStatus.providerLabel,
      detail: assistantStatus.message,
      icon: assistantStatus.ready ? ShieldCheckIcon : CpuChipIcon,
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300 backdrop-blur">
              <SparklesIcon className="h-4 w-4" />
              {assistantStatus.providerLabel}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">AI Assistant</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Ask about the selected document, current monitoring state, recent activity, or next review steps. The conversation stays tied to live app data, while the external model key can be added later without changing the UI.
              </p>
            </div>
          </div>

          <div className={`rounded-2xl border px-4 py-3 text-sm backdrop-blur ${assistantStatus.ready ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}>
            <div className="flex items-center gap-2 font-medium">
              {assistantStatus.ready ? <ShieldCheckIcon className="h-4 w-4" /> : <InformationCircleIcon className="h-4 w-4" />}
              {assistantStatus.ready ? 'Provider configuration detected' : 'Local contextual mode active'}
            </div>
            <p className="mt-1 max-w-sm text-xs leading-5 opacity-90">
              {assistantStatus.ready
                ? 'The external provider slot is ready for later wiring. The page remains fully usable right now.'
                : 'Add OPENAI_API_KEY or AI_MODEL_ENDPOINT later and the assistant will keep the same clean interface.'}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {topStats.map((card, index) => {
            const Icon = card.icon

            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/15 backdrop-blur"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-400">{card.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{card.detail}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-200">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[28px] border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/20 backdrop-blur"
          >
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Conversation</h2>
                  <p className="mt-1 text-sm text-slate-400">{contextSummary}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <ArrowPathIcon className="h-4 w-4" />
                  Live context synced
                </div>
              </div>
            </div>

            <div className="max-h-[30rem] space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
              {messages.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-6">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-cyan-300">
                      <ChatBubbleLeftRightIcon className="h-5 w-5" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-lg font-medium text-white">Start a contextual investigation</h3>
                      <p className="max-w-2xl text-sm leading-6 text-slate-300">{welcomeMessage}</p>
                      <div className="flex flex-wrap gap-2">
                        {promptSuggestions.slice(0, 3).map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            onClick={() => sendMessage(suggestion.prompt)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition hover:scale-[1.01] hover:shadow-lg ${toneStyles[suggestion.tone]}`}
                          >
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] rounded-3xl border px-4 py-3 shadow-lg ${message.role === 'user' ? 'border-cyan-400/30 bg-cyan-500/15 text-cyan-50' : 'border-white/10 bg-white/5 text-slate-100'}`}>
                      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                        <span>{message.role === 'user' ? 'You' : 'Assistant'}</span>
                        <span>{formatTimestamp(message.timestamp)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-inherit">{message.content}</p>

                      {message.role === 'assistant' && (message.topic || typeof message.confidence === 'number') && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                          {message.topic && (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{message.topic}</span>
                          )}
                          {typeof message.confidence === 'number' && (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{Math.round(message.confidence * 100)}% confidence</span>
                          )}
                        </div>
                      )}

                      {message.role === 'assistant' && message.followUps && message.followUps.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {message.followUps.map((followUp) => (
                            <button
                              key={followUp}
                              type="button"
                              onClick={() => sendMessage(followUp)}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
                            >
                              {followUp}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              )}

              {isSending && (
                <div className="flex justify-start">
                  <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-slate-300">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                      Thinking through live context...
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="space-y-4 border-t border-white/10 px-5 py-5 sm:px-6">
              {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <div className="relative">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        void sendMessage()
                      }
                    }}
                    rows={2}
                    placeholder="Ask about the current document, risk posture, or live monitoring state..."
                    className="min-h-[56px] w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400/50 focus:bg-white/10"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || isSending}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {isSending ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/20 border-t-slate-950" />
                      Sending
                    </>
                  ) : (
                    <>
                      <PaperAirplaneIcon className="h-4 w-4" />
                      Send
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={clearChat}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  <TrashIcon className="h-4 w-4" />
                  Clear
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <InformationCircleIcon className="h-4 w-4" />
                Press Enter to send, Shift+Enter for a new line.
              </div>
            </div>
          </motion.section>

          <div className="space-y-6">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-cyan-300">
                  <CpuChipIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Context Snapshot</h2>
                  <p className="text-sm text-slate-400">This panel updates with the current selected document and live telemetry.</p>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-slate-400">Selected document</p>
                  <p className="mt-1 font-medium text-white">{currentDocument ? currentDocument.filename : 'No document selected'}</p>
                  <p className="mt-1 text-xs text-slate-500">{currentDocumentSummary}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-slate-400">Authenticity</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {currentDocument?.results?.authenticity
                        ? `${Math.round(currentDocument.results.authenticity.score ?? 0)}/100`
                        : 'Pending'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-slate-400">Risk level</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {currentDocument?.results?.riskIntelligence?.riskCategory || 'Unknown'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-slate-400">Latest telemetry</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {liveStats
                      ? `${liveStats.documentsProcessed} processed · ${liveStats.highRiskFlags} high-risk flags · ${liveStats.activeAnalyses} active analyses`
                      : 'Loading live telemetry...'}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    AI {liveHealth?.aiEngine ?? 'unknown'} · Database {liveHealth?.database ?? 'unknown'} · Blockchain {liveHealth?.blockchainService ?? 'unknown'}
                  </p>
                </div>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-emerald-300">
                  <LightBulbIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Suggested prompts</h2>
                  <p className="text-sm text-slate-400">These suggestions are derived from the selected document and live monitoring state.</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {promptSuggestions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-slate-400">
                    No suggestions available yet.
                  </div>
                ) : (
                  promptSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => void sendMessage(suggestion.prompt)}
                      className={`w-full rounded-2xl border bg-gradient-to-r p-4 text-left transition hover:scale-[1.01] hover:shadow-lg ${toneStyles[suggestion.tone]}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{suggestion.label}</p>
                          <p className="mt-1 text-xs leading-5 text-white/70">{suggestion.prompt}</p>
                        </div>
                        <SparklesIcon className="h-4 w-4 text-white/70" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className={`rounded-[28px] border p-5 shadow-2xl shadow-black/20 backdrop-blur ${assistantStatus.ready ? 'border-emerald-400/20 bg-emerald-500/10' : 'border-amber-400/20 bg-amber-500/10'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`rounded-2xl border border-white/10 bg-white/5 p-3 ${assistantStatus.ready ? 'text-emerald-300' : 'text-amber-300'}`}>
                  <InformationCircleIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Provider readiness</h2>
                  <p className="text-sm text-slate-200/80">{assistantStatus.message}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-slate-100">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{assistantStatus.providerLabel}</span>
                {assistantStatus.configuredKeys.map((key) => (
                  <span key={key} className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-100">
                    {key}
                  </span>
                ))}
                {!assistantStatus.ready && assistantStatus.missingKeys.map((key) => (
                  <span key={key} className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-amber-100">
                    {key}
                  </span>
                ))}
              </div>

              {!assistantStatus.ready && (
                <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-slate-300">
                  The page is already wired for a future provider swap. Add the key later and keep the same UI.
                </div>
              )}
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-cyan-300">
                  <ClockIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Recent activity</h2>
                  <p className="text-sm text-slate-400">Pulled from the same live data service used across the dashboard.</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {recentActivity.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-slate-400">
                    No recent activity yet.
                  </div>
                ) : (
                  recentActivity.slice(0, 4).map((activity) => (
                    <div key={`${activity.id}-${activity.time}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{activity.document}</p>
                          <p className="mt-1 text-xs text-slate-400 capitalize">{activity.type.replace('_', ' ')}</p>
                        </div>
                        <span className="text-xs text-slate-500">{activity.time}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{activity.result}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    </div>
  )
}