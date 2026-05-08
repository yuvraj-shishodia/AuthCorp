'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClockIcon,
  LinkIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import type {
  BlockchainAnchoringConfig,
  BlockchainNetworkStatus,
} from '@/lib/blockchain-config'

type AnchorResult = {
  anchorId: string
  network: string
  networkLabel?: string
  chainId?: number
  status: string
  anchoredAt?: string
  hashPreview?: string
}

type AnchorHistoryEntry = AnchorResult & {
  id: string
}

const HISTORY_STORAGE_KEY = 'authcorp_blockchain_anchor_history'

const toneStyles: Record<BlockchainNetworkStatus['tone'], string> = {
  blue: 'from-blue-500/20 to-cyan-500/20 border-blue-400/30 text-blue-100',
  emerald: 'from-emerald-500/20 to-teal-500/20 border-emerald-400/30 text-emerald-100',
}

const statusPillStyles = {
  ready: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  pending: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
}

export default function BlockchainAnchoringPage() {
  const [hash, setHash] = useState('')
  const [networkConfig, setNetworkConfig] = useState<BlockchainAnchoringConfig | null>(null)
  const [selectedNetworkId, setSelectedNetworkId] = useState<string>('')
  const [result, setResult] = useState<AnchorResult | null>(null)
  const [history, setHistory] = useState<AnchorHistoryEntry[]>([])
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [isAnchoring, setIsAnchoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const loadConfig = async () => {
      try {
        setIsLoadingConfig(true)
        const [configResponse, storedHistory] = await Promise.all([
          fetch('/api/blockchain/config', { credentials: 'include' }),
          Promise.resolve(
            typeof window === 'undefined'
              ? []
              : JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) || '[]')
          ),
        ])

        if (!configResponse.ok) {
          throw new Error('Unable to load blockchain configuration')
        }

        const config = (await configResponse.json()) as BlockchainAnchoringConfig

        if (!mounted) {
          return
        }

        setNetworkConfig(config)
        setSelectedNetworkId((current) => current || config.defaultNetworkId || config.networks[0]?.id || '')
        setHistory(Array.isArray(storedHistory) ? storedHistory : [])
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load blockchain configuration')
          setNetworkConfig({
            networks: [],
            configuredCount: 0,
            totalCount: 0,
            defaultNetworkId: null,
            canAnchor: false,
          })
        }
      } finally {
        if (mounted) {
          setIsLoadingConfig(false)
        }
      }
    }

    loadConfig()

    return () => {
      mounted = false
    }
  }, [])

  const selectedNetwork = useMemo(
    () => networkConfig?.networks.find((item) => item.id === selectedNetworkId) ?? networkConfig?.networks[0] ?? null,
    [networkConfig, selectedNetworkId]
  )

  const configuredNetworks = networkConfig?.networks.filter((item) => item.configured) ?? []
  const canAnchor = Boolean(hash.trim()) && Boolean(selectedNetwork?.configured) && Boolean(networkConfig?.canAnchor) && !isAnchoring

  async function persistHistory(nextHistory: AnchorHistoryEntry[]) {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory))
  }

  async function submit() {
    setError(null)
    setResult(null)

    if (!selectedNetwork) {
      setError('Select a configured blockchain network first.')
      return
    }

    if (!selectedNetwork.configured) {
      setError(`Set ${selectedNetwork.rpcEnvKey} in .env.local to enable ${selectedNetwork.label}.`)
      return
    }

    if (!hash.trim()) {
      setError('Enter a SHA-256 document hash to anchor.')
      return
    }

    try {
      setIsAnchoring(true)
      const res = await fetch('/api/blockchain/anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ hash: hash.trim(), network: selectedNetwork.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Anchor failed')
      const nextResult: AnchorResult = {
        anchorId: data.anchorId,
        network: data.network,
        networkLabel: data.networkLabel,
        chainId: data.chainId,
        status: data.status,
        anchoredAt: data.anchoredAt,
        hashPreview: data.hashPreview,
      }

      setResult(nextResult)
      const nextHistory = [
        { ...nextResult, id: nextResult.anchorId },
        ...history,
      ].slice(0, 5)

      setHistory(nextHistory)
      void persistHistory(nextHistory)
    } catch (e: any) {
      setError(String(e.message || e))
    } finally {
      setIsAnchoring(false)
    }
  }

  const summaryCards = [
    {
      label: 'Configured networks',
      value: networkConfig ? `${networkConfig.configuredCount}/${networkConfig.totalCount}` : '—',
      detail: networkConfig?.canAnchor ? 'Ready to anchor' : 'Add RPC URLs in .env.local',
      icon: ShieldCheckIcon,
    },
    {
      label: 'Selected chain',
      value: selectedNetwork?.label ?? '—',
      detail: selectedNetwork?.configured ? `${selectedNetwork.chainId}` : 'No network selected',
      icon: LinkIcon,
    },
    {
      label: 'Recent anchors',
      value: history.length.toString(),
      detail: history.length > 0 ? 'Stored locally in this browser' : 'No anchors yet',
      icon: ClockIcon,
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-300">
              <SparklesIcon className="h-4 w-4" />
              Blockchain Anchoring
            </p>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Anchor document proofs to configured chains</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                The network picker, availability state, and anchor results are driven by your environment configuration. Set the RPC URLs once and the page stays in sync.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 backdrop-blur">
            {isLoadingConfig
              ? 'Loading network readiness...'
              : networkConfig?.canAnchor
                ? `${networkConfig.configuredCount} network${networkConfig.configuredCount === 1 ? '' : 's'} ready`
                : 'No blockchain RPC URLs configured'}
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </motion.div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          {summaryCards.map((card) => {
            const Icon = card.icon
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-400">{card.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
                    <p className="mt-1 text-xs text-slate-400">{card.detail}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-200">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 backdrop-blur"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Create Anchor</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Hash the document, choose a configured network, and send the anchor request.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {selectedNetwork?.configured ? `${selectedNetwork.label} ready` : 'Select a configured network'}
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Document hash</label>
                <div className="relative">
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400/50 focus:bg-white/10"
                    placeholder="SHA-256 hash for the document"
                    value={hash}
                    onChange={(e) => setHash(e.target.value)}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  The route validates the hash length and only anchors on networks enabled in your `.env.local`.
                </p>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-slate-300">Network</label>
                  <span className="text-xs text-slate-500">
                    {configuredNetworks.length > 0 ? `${configuredNetworks.length} configured` : 'No RPC URLs found'}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {(networkConfig?.networks ?? []).map((network) => {
                    const selected = selectedNetworkId === network.id
                    const configured = network.configured
                    const Icon = network.id === 'ethereum' ? ShieldCheckIcon : Squares2X2Icon

                    return (
                      <button
                        key={network.id}
                        type="button"
                        onClick={() => setSelectedNetworkId(network.id)}
                        className={`group rounded-2xl border p-4 text-left transition-all ${selected
                          ? `border-cyan-400/60 bg-gradient-to-br ${toneStyles[network.tone]} shadow-lg shadow-black/20`
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                        } ${!configured ? 'opacity-70' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Icon className={`h-5 w-5 ${selected ? 'text-white' : 'text-slate-300'}`} />
                              <h3 className="text-base font-semibold text-white">{network.label}</h3>
                            </div>
                            <p className={`text-sm ${selected ? 'text-white/80' : 'text-slate-400'}`}>{network.description}</p>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.2em] ${configured ? statusPillStyles.ready : statusPillStyles.pending}`}>
                            {configured ? 'Ready' : 'Needs RPC'}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">Chain {network.chainId}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{network.symbol}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{network.explorerLabel}</span>
                        </div>

                        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                          <span>{configured ? `Uses ${network.rpcEnvKey}` : `Set ${network.rpcEnvKey}`}</span>
                          <span className="inline-flex items-center gap-1">
                            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                            {network.explorerLabel}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canAnchor}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {isAnchoring ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/20 border-t-slate-950" />
                      Anchoring...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="h-4 w-4" />
                      Anchor Document
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setHash('')
                    setResult(null)
                    setError(null)
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  Clear
                </button>
              </div>

              {!networkConfig?.canAnchor && !isLoadingConfig && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  Add ETHEREUM_RPC_URL and/or POLYGON_RPC_URL to `.env.local` to enable the network cards and anchor button.
                </div>
              )}
            </div>
          </motion.div>

          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-cyan-300">
                  <LinkIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Configuration Health</h2>
                  <p className="text-sm text-slate-400">This panel is derived from the live blockchain config route.</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {isLoadingConfig ? (
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                    <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
                    <div className="h-4 w-48 animate-pulse rounded bg-white/10" />
                    <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <span className="text-sm text-slate-300">Anchoring status</span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${networkConfig?.canAnchor ? statusPillStyles.ready : statusPillStyles.pending}`}>
                        {networkConfig?.canAnchor ? 'Ready' : 'Waiting for RPC URLs'}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <h3 className="text-sm font-medium text-white">Configured networks</h3>
                      <div className="mt-3 space-y-3">
                        {(networkConfig?.networks ?? []).map((network) => (
                          <div key={network.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5">
                            <div>
                              <p className="text-sm font-medium text-white">{network.label}</p>
                              <p className="text-xs text-slate-400">{network.explorerLabel} · Chain {network.chainId}</p>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.2em] ${network.configured ? statusPillStyles.ready : statusPillStyles.pending}`}>
                              {network.configured ? 'Configured' : 'Missing key'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-emerald-300">
                  <SparklesIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Latest Anchor</h2>
                  <p className="text-sm text-slate-400">Anchor responses are returned from the API and stored locally for quick review.</p>
                </div>
              </div>

              {result ? (
                <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 text-emerald-200">
                    <CheckCircleIcon className="h-5 w-5" />
                    <span className="font-medium">{result.status === 'anchored' ? 'Anchor confirmed' : 'Anchor complete'}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                      <dt className="text-slate-400">Anchor ID</dt>
                      <dd className="mt-1 font-mono text-white break-all">{result.anchorId}</dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                      <dt className="text-slate-400">Network</dt>
                      <dd className="mt-1 text-white">{result.networkLabel ?? result.network}</dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                      <dt className="text-slate-400">Chain</dt>
                      <dd className="mt-1 text-white">{result.chainId ?? '—'}</dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                      <dt className="text-slate-400">Anchored at</dt>
                      <dd className="mt-1 text-white">{result.anchoredAt ? new Date(result.anchoredAt).toLocaleString() : '—'}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-300">
                    Hash preview: <span className="font-mono text-white">{result.hashPreview ?? hash.slice(0, 8)}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-slate-400">
                  Anchor a hash to see the latest receipt here.
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-amber-300">
                  <ClockIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Recent Anchors</h2>
                  <p className="text-sm text-slate-400">Persisted in this browser so the page feels alive across refreshes.</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {history.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-slate-400">
                    No anchors yet. Use the form to create the first receipt.
                  </div>
                ) : (
                  history.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{entry.networkLabel ?? entry.network}</p>
                          <p className="mt-1 text-xs text-slate-400 font-mono break-all">{entry.anchorId}</p>
                        </div>
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-200">
                          Anchored
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                        <span className="rounded-full border border-white/10 bg-slate-950/40 px-2.5 py-1">Chain {entry.chainId ?? '—'}</span>
                        <span className="rounded-full border border-white/10 bg-slate-950/40 px-2.5 py-1">{entry.hashPreview ?? 'hash preview unavailable'}</span>
                        <span className="rounded-full border border-white/10 bg-slate-950/40 px-2.5 py-1">
                          {entry.anchoredAt ? new Date(entry.anchoredAt).toLocaleString() : 'Just now'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}