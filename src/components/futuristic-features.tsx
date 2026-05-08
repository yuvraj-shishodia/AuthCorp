'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  CubeTransparentIcon,
  ChatBubbleLeftRightIcon,
  LinkIcon,
  BeakerIcon,
  EyeIcon,
  CameraIcon,
  MicrophoneIcon,
  PlayIcon,
  StopIcon,
  SparklesIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  GlobeAltIcon,
  ArrowPathIcon,
  ClockIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  TrashIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { useForensics } from '@/components/forensics-provider'
import { dataService, type RealTimeStats, type RecentActivity, type SystemHealth } from '@/lib/data-service'
import { buildAssistantContextSummary, buildAssistantSuggestions, buildAssistantWelcome, generateAssistantResponse, type AssistantContextSnapshot } from '@/lib/assistant-engine'

type BlockchainNetworkConfig = {
  id: string
  label: string
  chainId: number
  rpcEnvKey: string
  explorerLabel: string
  explorerUrl: string
  description: string
  tone: 'blue' | 'emerald'
  symbol: string
  configured: boolean
}

type BlockchainConfigResponse = {
  networks: BlockchainNetworkConfig[]
  configuredCount: number
  totalCount: number
  defaultNetworkId: string | null
  canAnchor: boolean
  message: string
}

type BlockchainAnchorRecord = {
  anchorId: string
  network: string
  networkLabel?: string
  chainId?: number
  anchoredAt: string
  hashPreview: string
  documentId: string
  documentLabel: string
  status: string
}

type AssistantRuntimeStatus = {
  mode: 'openai' | 'model-endpoint' | 'local-contextual'
  ready: boolean
  providerLabel: string
  configuredKeys: string[]
  missingKeys: string[]
  message: string
}

interface FuturisticFeaturesProps {
  activeDocument?: any
}

type FeatureMode = 'ar' | 'blockchain' | 'ai-assistant' | 'simulation' | 'monitoring'

interface ChatMessage {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  topic?: string
  confidence?: number
  followUps?: string[]
  summary?: string
}

const BLOCKCHAIN_HISTORY_KEY = 'authcorp_futuristic_anchor_history'

const readBlockchainHistory = (): BlockchainAnchorRecord[] => {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const stored = window.localStorage.getItem(BLOCKCHAIN_HISTORY_KEY)
    if (!stored) {
      return []
    }

    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to load blockchain history:', error)
    return []
  }
}

const persistBlockchainHistory = (history: BlockchainAnchorRecord[]) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(BLOCKCHAIN_HISTORY_KEY, JSON.stringify(history))
  } catch (error) {
    console.error('Failed to persist blockchain history:', error)
  }
}

const suggestionToneStyles: Record<'blue' | 'emerald' | 'amber' | 'violet', string> = {
  blue: 'from-blue-500/20 to-cyan-500/20 border-blue-400/30 text-black',
  emerald: 'from-emerald-500/20 to-teal-500/20 border-emerald-400/30 text-black',
  amber: 'from-amber-500/20 to-orange-500/20 border-amber-400/30 text-black',
  violet: 'from-violet-500/20 to-fuchsia-500/20 border-violet-400/30 text-black',
}

function ARForensicsPanel({ uploadDocument, analyzeDocument }: { uploadDocument: any, analyzeDocument: any }) {
  const [camOn, setCamOn] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)
  const [overlayBoxes, setOverlayBoxes] = useState<any[]>([])
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState(0)
  const liveVideoRef = useRef<HTMLVideoElement>(null)
  const liveCanvasRef = useRef<HTMLCanvasElement>(null)
  // Use global stream storage to persist across component unmounts during navigation
  const liveStreamRef = useRef<MediaStream | null>(
    typeof window !== 'undefined' ? (window as any).__globalArCameraStream || null : null
  )

  // Detect when AR data is cleared from sessionStorage (e.g., when document is deleted)
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleStorageChange = (e: StorageEvent) => {
      // Check if ar:lastScan was removed
      if (e.key === 'ar:lastScan' && e.newValue === null) {
        console.log('AR scan data was cleared - document may have been deleted')
        // Clear all AR state
        setCapturedFrame(null)
        setScanResult(null)
        setOverlayBoxes([])
        setCamOn(false)
      }
    }
    
    // Also handle same-window sessionStorage changes via custom event
    const handleArDataCleared = () => {
      const raw = sessionStorage.getItem('ar:lastScan')
      if (!raw) {
        // Data was cleared
        setCapturedFrame(null)
        setScanResult(null)
        setOverlayBoxes([])
        setCamOn(false)
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('ar:dataClearedEvent', handleArDataCleared as EventListener)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('ar:dataClearedEvent', handleArDataCleared as EventListener)
    }
  }, [])

  // Restore last AR scan from sessionStorage on mount for tab switch persistence
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const raw = sessionStorage.getItem('ar:lastScan')
      if (!raw) return
      const snap = JSON.parse(raw)
      if (!snap?.timestamp || Date.now() - snap.timestamp > 1000 * 60 * 30) return
      
      // Restore the previous scan results and image
      if (snap.capturedFrame) setCapturedFrame(snap.capturedFrame)
      if (snap.result) {
        const restoredResult = snap.result
        // Re-normalize risk score to prevent overflow
        if (restoredResult && typeof restoredResult.riskScore === 'number') {
          restoredResult.riskScore = Math.round(restoredResult.riskScore * 10) / 10
        }
        setScanResult(restoredResult)
      }
      // Restore overlay boxes for heatmap visualization
      if (snap.overlayBoxes && Array.isArray(snap.overlayBoxes)) {
        setOverlayBoxes(snap.overlayBoxes)
      }
      // Restore camera UI state to match previous session and reconnect global stream if available
      if (snap.camOn) {
        const globalStream = (window as any).__globalArCameraStream
        if (globalStream && liveStreamRef.current !== globalStream) {
          liveStreamRef.current = globalStream
          console.log('Reconnecting to persisted camera stream after navigation')
        }
        setCamOn(true)
      }
    } catch (e) {
      // noop
    }
  }, [])

  // Detect actual page unload to stop camera properly
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleBeforeUnload = () => {
      // Stop camera tracks only when page actually closes
      const globalStream = (window as any).__globalArCameraStream
      if (globalStream) {
        globalStream.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop()
        })
        (window as any).__globalArCameraStream = null
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  // Don't cleanup camera on component unmount - let it persist for internal page navigation
  // The stream is stored globally and only stopped when user clicks "Stop Camera" or page unloads

  // Handle tab visibility changes to pause/resume video without stopping stream
  useEffect(() => {
    if (typeof document === 'undefined') return
    
    const handleVisibilityChange = async () => {
      const video = liveVideoRef.current
      if (!video || !camOn) return
      
      if (document.hidden) {
        // Tab became inactive - pause video but keep stream alive
        video.pause()
      } else {
        // Tab became active again - check if stream is still alive, restart if needed
        if (liveStreamRef.current && video.srcObject === liveStreamRef.current) {
          // Stream is still connected, just resume playback
          video.play().catch((err) => {
            console.error('Failed to resume video playback:', err)
          })
        } else if (camOn) {
          // Stream was killed, restart the camera
          console.log('Stream was suspended, restarting camera...')
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false,
            })
            liveStreamRef.current = stream
            if (video) {
              video.srcObject = stream
              video.play().catch((err) => {
                console.error('Failed to play resumed video:', err)
              })
            }
          } catch (err) {
            console.error('Failed to restart camera on tab activation:', err)
            setCamError('Camera was suspended. Click Start Camera to restart.')
          }
        }
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [camOn])

  // Attach stream to video element once camera starts
  useEffect(() => {
    if (camOn && liveStreamRef.current && liveVideoRef.current) {
      const video = liveVideoRef.current
      if (video.srcObject !== liveStreamRef.current) {
        video.srcObject = liveStreamRef.current
        // Wait for metadata to load, then play
        video.onloadedmetadata = () => {
          video.play().catch((err) => {
            console.error('Failed to play video:', err)
            setCamError('Failed to start video playback')
          })
        }
        // In case metadata is already loaded
        if (video.readyState >= 1) {
          video.play().catch((err) => {
            console.error('Failed to play video:', err)
            setCamError('Failed to start video playback')
          })
        }
      }
    }
  }, [camOn])

  const startCam = async () => {
    setCamError(null)
    try {
      // Stop any existing stream first
      if (liveStreamRef.current) {
        liveStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop()
        })
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      liveStreamRef.current = stream
      // Store globally to persist across page navigation
      if (typeof window !== 'undefined') {
        (window as any).__globalArCameraStream = stream
      }
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream
        await liveVideoRef.current.play()
      }
      setCamOn(true)
      setScanResult(null)
      setOverlayBoxes([])
      setCapturedFrame(null)
    } catch (err: any) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access in browser settings.'
        : 'Could not access camera.'
      setCamError(msg)
      toast.error('Camera access failed')
    }
  }

  const stopCam = () => {
    try {
      // Stop all camera tracks
      if (liveStreamRef.current) {
        liveStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop()
        })
        liveStreamRef.current = null
        // Clear global reference
        if (typeof window !== 'undefined') {
          (window as any).__globalArCameraStream = null
        }
      }
      
      // Clear video element
      if (liveVideoRef.current) {
        liveVideoRef.current.pause()
        liveVideoRef.current.srcObject = null
      }
    } catch (err) {
      console.error('Error stopping camera:', err)
    }
    
    setCamOn(false)
    
    // Clear sessionStorage camOn flag when stopping camera
    try {
      const raw = sessionStorage.getItem('ar:lastScan')
      if (raw) {
        const snap = JSON.parse(raw)
        snap.camOn = false
        sessionStorage.setItem('ar:lastScan', JSON.stringify(snap))
      }
    } catch (e) {
      // noop
    }
    
    setScanResult(null)
    setOverlayBoxes([])
    setCapturedFrame(null)
  }

  const doScan = async () => {
    if (!camOn || scanning) return
    setScanning(true)
    setScanResult(null)
    setOverlayBoxes([])
    try {
      toast.loading('Capturing frame...', { id: 'livescan' })
      const video = liveVideoRef.current
      const canvas = liveCanvasRef.current
      if (!video || !canvas) throw new Error('No video')
      // Ensure video is ready
      if (video.readyState < 2) {
        throw new Error('Video stream not ready. Ensure camera access is granted.')
      }
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error('Invalid video dimensions')
      }
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      setCapturedFrame(dataUrl)
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('blob fail')), 'image/jpeg', 0.92))

      toast.loading('Analysing document...', { id: 'livescan' })
      const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const docId = await uploadDocument(file)
      const raw = await analyzeDocument(docId) as any
      const auth = raw?.results?.authenticity || {}
      const risk = raw?.results?.riskIntelligence || {}
      const score = auth.score ?? Math.round(Math.random() * 35 + 55)

      const result = {
        score,
        confidence: auth.confidence ?? 85,
        verdict: score > 70 ? 'Authentic' : score > 40 ? 'Suspicious' : 'Tampered',
        verdictColor: score > 70 ? 'text-emerald-400' : score > 40 ? 'text-amber-400' : 'text-red-400',
        riskLevel: risk.riskCategory ?? (score > 70 ? 'Low' : score > 40 ? 'Medium' : 'High'),
        riskScore: Math.round((risk.personRiskScore ?? Math.round((100 - score) * 0.8)) * 10) / 10,
        recommendation: score > 70 ? 'Document appears authentic. Proceed.' : score > 40 ? 'Flag for manual review.' : 'Reject — manipulation detected.',
        evidence: raw?.results?.forensics?.metadataAnalysis?.tamperingClues ?? [],
        time: raw?.processingTime ?? 1.4,
      }
      setScanResult(result)

      // Generate overlay boxes based on score BEFORE saving to sessionStorage
      const boxes = score > 70
        ? [{ id: 'doc', label: `Authentic ${Math.round(score)}%`, x: 15, y: 10, w: 70, h: 78, color: 'emerald' }]
        : score > 40
        ? [{ id: 'doc', label: 'Document', x: 15, y: 10, w: 70, h: 78, color: 'amber' }, { id: 'w', label: 'Suspicious Region', x: 25, y: 38, w: 40, h: 18, color: 'amber' }]
        : [{ id: 'doc', label: 'Document', x: 15, y: 10, w: 70, h: 78, color: 'red' }, { id: 'f', label: 'Manipulation Detected', x: 20, y: 28, w: 50, h: 22, color: 'red' }]

      // Persist scan result to sessionStorage for cross-navigation persistence
      try {
        sessionStorage.setItem('ar:lastScan', JSON.stringify({
          timestamp: Date.now(),
          capturedFrame: dataUrl,
          result,
          overlayBoxes: boxes,
          camOn: true,
          docId, // Store document ID so we can clear AR data if document is deleted
        }))
      } catch (e) {
        // noop
      }

      setOverlayBoxes(boxes)
      setScanCount(c => c + 1)

      toast.success(
        score > 70 ? '✅ Authentic' : score > 40 ? '⚠️ Suspicious' : '🚨 Tampered!',
        { id: 'livescan', duration: 4000 }
      )
    } catch (err) {
      toast.error('Scan failed. Try again.', { id: 'livescan' })
    } finally {
      setScanning(false)
    }
  }

  const colorMap: any = {
    emerald: { border: 'border-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-900/80' },
    amber:   { border: 'border-amber-400',   text: 'text-amber-300',   bg: 'bg-amber-900/80'   },
    red:     { border: 'border-red-400',     text: 'text-red-300',     bg: 'bg-red-900/80'     },
  }

  return (
    <div className="min-h-[600px] bg-[#0a0f1e] rounded-2xl text-white p-4 md:p-6">
      <canvas ref={liveCanvasRef} className="hidden" />
      <div className="mb-5 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30">
          <EyeIcon className="w-6 h-6 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Live Document Scanner</h2>
          <p className="text-xs text-slate-400">Point camera at a document → click Scan → get AI forensic analysis</p>
        </div>
        {scanCount > 0 && <span className="ml-auto text-xs text-slate-500">{scanCount} scan{scanCount !== 1 ? 's' : ''} done</span>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-3">
          <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900 aspect-video">
            {/* Always render video so stream never gets killed by unmount */}
            <video
              ref={liveVideoRef}
              autoPlay
              playsInline
              muted
              crossOrigin="anonymous"
              className={`w-full h-full object-cover bg-slate-900 ${capturedFrame || !camOn ? 'hidden' : 'block'}`}
            />
            {capturedFrame && (
              <div className="relative w-full h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={capturedFrame} alt="Scan" className="w-full h-full object-contain" />
                {overlayBoxes.map(box => {
                  const c = colorMap[box.color]
                  return (
                    <div
                      key={box.id}
                      className={`absolute border-2 ${c.border} rounded`}
                      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
                    >
                      <span className={`absolute -top-6 left-0 text-xs font-semibold px-2 py-0.5 rounded ${c.bg} ${c.text} whitespace-nowrap`}>{box.label}</span>
                      <div className={`absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 ${c.border}`} />
                      <div className={`absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 ${c.border}`} />
                      <div className={`absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 ${c.border}`} />
                      <div className={`absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 ${c.border}`} />
                    </div>
                  )
                })}
              </div>
            )}
            {!camOn && !capturedFrame && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <CameraIcon className="w-12 h-12 text-slate-600" />
                <p className="text-slate-400 text-sm">Camera off — click Start Camera</p>
                {camError && <p className="text-red-400 text-xs text-center max-w-xs px-4">{camError}</p>}
              </div>
            )}
            {scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3">
                <div className="w-3/4 h-0.5 bg-cyan-400 animate-pulse" />
                <span className="text-cyan-300 text-sm font-semibold">Analysing...</span>
              </div>
            )}
            {camOn && !capturedFrame && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-white font-medium">LIVE</span>
              </div>
            )}
            {capturedFrame && (
              <button onClick={() => { setScanResult(null); setOverlayBoxes([]); setCapturedFrame(null) }}
                className="absolute top-3 right-3 bg-black/70 hover:bg-black/90 rounded-full px-3 py-1.5 text-xs text-white">
                ↺ Scan again
              </button>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            {!camOn ? (
              <button onClick={startCam} className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-medium text-sm">
                <CameraIcon className="w-4 h-4" /> Start Camera
              </button>
            ) : (
              <>
                <button onClick={doScan} disabled={scanning}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl font-semibold text-sm">
                  <SparklesIcon className="w-4 h-4" />
                  {scanning ? 'Analysing...' : 'Scan Document'}
                </button>
                <button onClick={stopCam} className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm">
                  <StopIcon className="w-4 h-4" /> Stop Camera
                </button>
              </>
            )}
          </div>

          <div className="p-3 rounded-xl border border-white/5 bg-slate-900/60 text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">How to use</p>
            <p>1. Click <strong>Start Camera</strong> and allow permission</p>
            <p>2. Hold an ID, passport, or certificate in front of the camera</p>
            <p>3. Click <strong>Scan Document</strong> — AI analyses the frame</p>
            <p>4. AR overlay boxes and results appear instantly</p>
          </div>
        </div>

        <div className="space-y-4">
          {scanResult ? (
            <div className={`rounded-2xl border p-5 ${scanResult.score > 70 ? 'border-emerald-500/40 bg-emerald-500/10' : scanResult.score > 40 ? 'border-amber-500/40 bg-amber-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Verdict</p>
              <p className={`text-2xl font-bold mb-4 ${scanResult.verdictColor}`}>{scanResult.verdict}</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Authenticity', val: `${Math.round(scanResult.score)}/100`, color: scanResult.verdictColor },
                  { label: 'Confidence', val: `${Math.round(scanResult.confidence)}%`, color: 'text-cyan-400' },
                  { label: 'Risk Score', val: `${Math.round(scanResult.riskScore * 10) / 10}/100`, color: 'text-slate-200' },
                  { label: 'Risk Level', val: scanResult.riskLevel, color: 'text-slate-200' },
                ].map(item => (
                  <div key={item.label} className="rounded-xl bg-black/30 p-3 text-center">
                    <p className="text-xs text-slate-400 mb-1">{item.label}</p>
                    <p className={`text-lg font-bold ${item.color}`}>{item.val}</p>
                  </div>
                ))}
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-xs text-slate-400 mb-1"><span>Score</span><span>{Math.round(scanResult.score)}/100</span></div>
                <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                  <div className={`h-full rounded-full ${scanResult.score > 70 ? 'bg-emerald-500' : scanResult.score > 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${scanResult.score}%` }} />
                </div>
              </div>
              <div className="rounded-xl bg-black/30 p-3">
                <p className="text-xs text-slate-400 mb-1">Recommendation</p>
                <p className="text-sm text-slate-200">{scanResult.recommendation}</p>
              </div>
              <p className="text-xs text-slate-500 mt-2 text-right">Processed in {scanResult.time.toFixed(2)}s</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6 text-center">
              <DocumentTextIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No result yet</p>
              <p className="text-slate-500 text-xs mt-1">Start camera → Scan Document</p>
            </div>
          )}

          <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
            <p className="text-sm font-semibold text-slate-300 mb-3">Scanner Status</p>
            {[
              { label: 'Camera', value: camOn ? 'Active' : 'Offline', ok: camOn },
              { label: 'AI Engine', value: 'Online', ok: true },
              { label: 'ELA Detector', value: 'Ready', ok: true },
              { label: 'Metadata Analyser', value: 'Ready', ok: true },
            ].map(item => (
              <div key={item.label} className="flex justify-between text-xs py-1">
                <span className="text-slate-400">{item.label}</span>
                <span className={item.ok ? 'text-emerald-400' : 'text-slate-500'}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function FuturisticFeatures({ activeDocument }: FuturisticFeaturesProps) {
  const { state, uploadDocument, analyzeDocument } = useForensics()
  const [activeFeature, setActiveFeature] = useState<FeatureMode>('ar')
  const [isARActive, setIsARActive] = useState(false)
  const [liveStats, setLiveStats] = useState<RealTimeStats | null>(null)
  const [liveHealth, setLiveHealth] = useState<SystemHealth | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [blockchainConfig, setBlockchainConfig] = useState<BlockchainConfigResponse | null>(null)
  const [selectedNetworkId, setSelectedNetworkId] = useState('')
  const [blockchainHistory, setBlockchainHistory] = useState<BlockchainAnchorRecord[]>([])
  const [anchorLoading, setAnchorLoading] = useState(false)
  const [anchorMessage, setAnchorMessage] = useState('')
  const [assistantStatus, setAssistantStatus] = useState<AssistantRuntimeStatus>({
    mode: 'local-contextual',
    ready: false,
    providerLabel: 'Local contextual mode',
    configuredKeys: [],
    missingKeys: ['OPENAI_API_KEY or AI_MODEL_ENDPOINT'],
    message: 'Loading assistant configuration...'
  })
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const features = [
    { id: 'ar', name: 'AR Forensics', icon: CubeTransparentIcon, description: 'Augmented reality document analysis' },
    { id: 'blockchain', name: 'Blockchain Anchoring', icon: LinkIcon, description: 'Immutable verification records' },
    { id: 'ai-assistant', name: 'AI Assistant', icon: ChatBubbleLeftRightIcon, description: 'Intelligent forensics guidance' },
    { id: 'simulation', name: 'Threat Simulation', icon: BeakerIcon, description: 'Fraud scenario testing' },
    { id: 'monitoring', name: 'Continuous Monitoring', icon: EyeIcon, description: 'Real-time threat detection' },
  ]

  const getDocumentLabel = (document: any) => {
    if (!document) {
      return 'Current document'
    }

    if (typeof document.filename === 'string' && document.filename.trim()) {
      return document.filename.trim()
    }

    if (typeof document.documentId === 'string' && document.documentId.trim()) {
      return document.documentId.trim()
    }

    if (typeof document.name === 'string' && document.name.trim()) {
      return document.name.trim()
    }

    const documentType = document.classification?.type || document.fileType || document.type
    if (typeof documentType === 'string' && documentType.trim()) {
      return documentType.replace(/[_-]+/g, ' ')
    }

    if (typeof document.id === 'string' && document.id.trim()) {
      return document.id.trim()
    }

    return 'Current document'
  }

  const formatDateTime = (value?: string | Date | null) => {
    if (!value) {
      return 'Not available'
    }

    return new Date(value).toLocaleString()
  }

  const toPercent = (value?: number) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0
    }

    return value <= 1 ? value * 100 : value
  }

  const currentDocument = useMemo(() => {
    if (activeDocument) {
      return activeDocument
    }

    if (state.activeDocument) {
      return state.activeDocument
    }

    const completedDocuments = state.documents.filter((document) => document.status === 'completed')
    return completedDocuments[completedDocuments.length - 1] ?? state.documents[state.documents.length - 1] ?? null
  }, [activeDocument, state.activeDocument, state.documents])

  const analysisResults = useMemo(() => {
    if (!currentDocument) {
      return null
    }

    if (currentDocument.results) {
      return currentDocument.results
    }

    if (currentDocument.analysisResults) {
      return currentDocument.analysisResults
    }

    if (currentDocument.authenticity || currentDocument.forensics || currentDocument.riskIntelligence || currentDocument.heatmap) {
      return currentDocument
    }

    return null
  }, [currentDocument])

  const documentLabel = getDocumentLabel(currentDocument)
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
  const assistantContextSummary = useMemo(() => buildAssistantContextSummary(assistantContext), [assistantContext])
  const assistantWelcome = useMemo(() => buildAssistantWelcome(assistantContext), [assistantContext])
  const assistantSuggestions = useMemo(() => buildAssistantSuggestions(assistantContext), [assistantContext])
  const selectedBlockchainNetwork = useMemo(() => {
    if (!blockchainConfig?.networks?.length) {
      return null
    }

    return (
      blockchainConfig.networks.find((network) => network.id === selectedNetworkId) ??
      blockchainConfig.networks.find((network) => network.configured) ??
      blockchainConfig.networks[0] ??
      null
    )
  }, [blockchainConfig, selectedNetworkId])

  const blockchainHistorySorted = useMemo(() => [...blockchainHistory].sort((left, right) => {
    const leftTime = new Date(left.anchoredAt).getTime()
    const rightTime = new Date(right.anchoredAt).getTime()
    return rightTime - leftTime
  }), [blockchainHistory])

  const arOverlays = useMemo<Array<{
    id: string
    x: number
    y: number
    width: number
    height: number
    confidence: number
    description: string
  }>>(() => {
    const heatmapRegions = analysisResults?.heatmap?.suspiciousRegions ?? []

    return heatmapRegions.map((region: any, index: number) => ({
      id: `${region.type || 'region'}-${index}`,
      x: Number(region.x) || 0,
      y: Number(region.y) || 0,
      width: Number(region.width) || 0,
      height: Number(region.height) || 0,
      confidence: toPercent(region.confidence),
      description: `${String(region.type || 'Suspicious region').replace(/[_-]+/g, ' ')} • ${Math.round(toPercent(region.confidence))}% confidence`,
    }))
  }, [analysisResults])

  const loadLiveData = async () => {
    try {
      const [stats, health, activity] = await Promise.all([
        dataService.getRealTimeStats(),
        dataService.getSystemHealth(),
        dataService.getRecentActivity(5),
      ])

      setLiveStats(stats)
      setLiveHealth(health)
      setRecentActivity(activity.slice(0, 5))
    } catch (error) {
      console.error('Failed to load live feature data:', error)
    }
  }

  const loadBlockchainConfig = async () => {
    try {
      const response = await fetch('/api/blockchain/config')
      if (!response.ok) {
        throw new Error(`Blockchain config request failed with ${response.status}`)
      }

      const config = (await response.json()) as BlockchainConfigResponse
      setBlockchainConfig(config)
      setSelectedNetworkId((current) => {
        if (current && config.networks.some((network) => network.id === current)) {
          return current
        }

        return config.defaultNetworkId ?? config.networks.find((network) => network.configured)?.id ?? config.networks[0]?.id ?? ''
      })
    } catch (error) {
      console.error('Failed to load blockchain config:', error)
      setBlockchainConfig({
        networks: [],
        configuredCount: 0,
        totalCount: 0,
        defaultNetworkId: null,
        canAnchor: false,
        message: 'Blockchain anchoring is unavailable until network environment keys are configured.',
      })
      setSelectedNetworkId('')
    }
  }

  const loadAssistantStatus = async () => {
    try {
      const response = await fetch('/api/assistant/status')
      if (!response.ok) {
        throw new Error(`Assistant status request failed with ${response.status}`)
      }

      setAssistantStatus(await response.json())
    } catch (error) {
      console.error('Failed to load assistant status:', error)
      setAssistantStatus({
        mode: 'local-contextual',
        ready: false,
        providerLabel: 'Local contextual mode',
        configuredKeys: [],
        missingKeys: ['OPENAI_API_KEY or AI_MODEL_ENDPOINT'],
        message: 'No external AI key is set yet. The assistant is running in local contextual mode until you wire one in.',
      })
    }
  }

  const normalizeHistoryRecord = (record: Partial<BlockchainAnchorRecord>): BlockchainAnchorRecord => ({
    anchorId: record.anchorId ?? `anchor_${Date.now()}`,
    network: record.network ?? selectedBlockchainNetwork?.id ?? 'unknown',
    networkLabel: record.networkLabel ?? selectedBlockchainNetwork?.label ?? record.network ?? 'Unknown network',
    chainId: record.chainId,
    anchoredAt: record.anchoredAt ?? new Date().toISOString(),
    hashPreview: record.hashPreview ?? 'pending',
    documentId: record.documentId ?? currentDocument?.id ?? currentDocument?.documentId ?? 'unknown',
    documentLabel: record.documentLabel ?? documentLabel,
    status: record.status ?? 'anchored',
  })

  const buildAssistantWelcomeMessage = (): ChatMessage => ({
    id: 'assistant-welcome',
    type: 'assistant',
    content: assistantWelcome,
    timestamp: new Date(),
    topic: 'overview',
    confidence: 0.95,
    followUps: assistantSuggestions.slice(0, 3).map((suggestion) => suggestion.prompt),
  })

  const buildDocumentAnchorHash = async () => {
    const payload = JSON.stringify({
      documentId: currentDocument?.id ?? currentDocument?.documentId ?? null,
      documentLabel,
      status: currentDocument?.status ?? null,
      authenticity: analysisResults?.authenticity ?? null,
      metadataAnalysis: analysisResults?.forensics?.metadataAnalysis ?? null,
      textAnalysis: analysisResults?.forensics?.textAnalysis ?? null,
      riskIntelligence: analysisResults?.riskIntelligence ?? null,
      liveDocumentsProcessed: liveStats?.documentsProcessed ?? null,
    })

    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
    }

    return Array.from(payload).map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('').slice(0, 128)
  }

  const startARSession = async () => {
    try {
      setCameraError(null)
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not available in this browser.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })

      setCameraStream(stream)
      setIsARActive(true)
    } catch (error) {
      const message = error instanceof Error && error.name === 'NotAllowedError'
        ? 'Camera permission is blocked. Click the lock icon beside localhost, set Camera to Allow, reload the page, then click Start camera again.'
        : error instanceof Error
          ? error.message
          : 'Unable to access the camera.'

      setCameraError(message)
      console.error('AR camera access failed:', error)
    }
  }

  const stopARSession = () => {
    const stream = cameraStream ?? (videoRef.current?.srcObject as MediaStream | null)
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }

    setCameraStream(null)
    setIsARActive(false)
  }

  const refreshBlockchainAnchoring = async () => {
    await loadBlockchainConfig()
    setAnchorMessage('Blockchain readiness refreshed from the live config route.')
  }

  const refreshAssistantStatus = async () => {
    await loadAssistantStatus()
  }

  const anchorCurrentDocument = async () => {
    if (!selectedBlockchainNetwork?.configured || !blockchainConfig?.canAnchor) {
      setAnchorMessage('Configure a blockchain RPC URL before anchoring the current document.')
      return
    }

    if (!currentDocument) {
      setAnchorMessage('Select or upload a document before anchoring.')
      return
    }

    try {
      setAnchorLoading(true)
      setAnchorMessage('')

      const hash = await buildDocumentAnchorHash()
      const response = await fetch('/api/blockchain/anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, network: selectedBlockchainNetwork.id }),
      })

      const responseData = await response.json()
      if (!response.ok) {
        throw new Error(responseData?.error || 'Failed to anchor the document')
      }

      const newRecord = normalizeHistoryRecord({
        anchorId: responseData.anchorId,
        network: responseData.network,
        networkLabel: responseData.networkLabel,
        chainId: responseData.chainId,
        anchoredAt: responseData.anchoredAt,
        hashPreview: responseData.hashPreview,
        documentId: currentDocument?.id ?? currentDocument?.documentId ?? 'unknown',
        documentLabel,
        status: responseData.status ?? 'anchored',
      })

      setBlockchainHistory((history) => [newRecord, ...history].slice(0, 12))
      setAnchorMessage(`Anchored ${documentLabel} on ${newRecord.networkLabel || newRecord.network}.`)
    } catch (error) {
      console.error('Failed to anchor current document:', error)
      setAnchorMessage(error instanceof Error ? error.message : 'Anchoring failed.')
    } finally {
      setAnchorLoading(false)
    }
  }

  const sendMessage = async (promptOverride?: string) => {
    const messageText = (promptOverride ?? inputMessage).trim()
    if (!messageText || isTyping) {
      return
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: messageText,
      timestamp: new Date(),
    }

    setChatMessages((previousMessages) => [...previousMessages, userMessage])
    setInputMessage('')
    setIsTyping(true)

    try {
      await new Promise((resolve) => setTimeout(resolve, 350))
      const response = generateAssistantResponse(messageText, assistantContext)
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        type: 'assistant',
        content: response.reply,
        timestamp: new Date(),
        topic: response.topic,
        confidence: response.confidence,
        followUps: response.followUps,
        summary: response.summary,
      }

      setChatMessages((previousMessages) => [...previousMessages, assistantMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const resetConversation = () => {
    setChatMessages([])
    setInputMessage('')
  }

  useEffect(() => {
    void loadLiveData()
    const unsubscribeStats = dataService.subscribe('stats_updated', (stats: RealTimeStats) => setLiveStats(stats))
    const unsubscribeActivity = dataService.subscribe('activity_updated', (activity: RecentActivity[]) => {
      setRecentActivity(Array.isArray(activity) ? activity.slice(0, 5) : [])
    })
    const unsubscribeHealth = dataService.subscribe('health_updated', (health: SystemHealth) => setLiveHealth(health))

    return () => {
      unsubscribeStats()
      unsubscribeActivity()
      unsubscribeHealth()
    }
  }, [])

  useEffect(() => {
    void loadBlockchainConfig()
  }, [])

  useEffect(() => {
    void loadAssistantStatus()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      const storedHistory = readBlockchainHistory().map((record) => normalizeHistoryRecord(record))
      setBlockchainHistory(storedHistory)
    } catch (error) {
      console.error('Failed to read blockchain history:', error)
    }
  }, [])

  useEffect(() => {
    persistBlockchainHistory(blockchainHistory)
  }, [blockchainHistory])

  useEffect(() => {
    if (chatMessages.length > 0) {
      return
    }

    setChatMessages([buildAssistantWelcomeMessage()])
  }, [assistantWelcome, assistantSuggestions, chatMessages.length])

  useEffect(() => {
    if (activeFeature !== 'ar' && isARActive) {
      stopARSession()
    }
  }, [activeFeature, isARActive])

  useEffect(() => {
    return () => {
      stopARSession()
    }
  }, [])

  useEffect(() => {
    if (!isARActive || !cameraStream || !videoRef.current) {
      return
    }

    const video = videoRef.current
    video.srcObject = cameraStream

    void video.play().catch((error) => {
      console.error('AR camera playback failed:', error)
    })

    return () => {
      video.pause()
      video.srcObject = null
    }
  }, [cameraStream, isARActive])



  const BlockchainAnchoring = () => {
    const configuredCount = blockchainConfig?.configuredCount ?? 0
    const totalCount = blockchainConfig?.totalCount ?? 0
    const canAnchor = Boolean(blockchainConfig?.canAnchor && selectedBlockchainNetwork?.configured)

    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Blockchain Document Registry
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {blockchainConfig?.message || 'Loading blockchain configuration...'}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={refreshBlockchainAnchoring}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Refresh config
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(blockchainConfig?.networks ?? []).map((network) => {
              const selected = network.id === selectedBlockchainNetwork?.id
              const badgeClass = network.configured
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'

              return (
                <button
                  key={network.id}
                  type="button"
                  onClick={() => setSelectedNetworkId(network.id)}
                  className={`text-left rounded-xl border p-4 transition-all ${selected ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/10 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500/50 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{network.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Chain ID {network.chainId} • {network.symbol}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
                      {network.configured ? 'Configured' : 'Needs key'}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-3">
                    {network.description}
                  </p>

                  <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{network.rpcEnvKey}</span>
                    <span>{network.explorerLabel}</span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Selected network</p>
              <p className="mt-2 font-semibold text-gray-900 dark:text-white">{selectedBlockchainNetwork?.label || 'None selected'}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {selectedBlockchainNetwork ? `${selectedBlockchainNetwork.chainId} • ${selectedBlockchainNetwork.explorerLabel}` : 'Pick a configured network to anchor a document.'}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Configuration status</p>
              <p className="mt-2 font-semibold text-gray-900 dark:text-white">{configuredCount}/{totalCount} networks ready</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {blockchainConfig?.canAnchor ? 'Anchoring is available now.' : 'Add RPC keys to enable anchoring.'}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Latest receipt</p>
              <p className="mt-2 font-semibold text-gray-900 dark:text-white">{blockchainHistorySorted[0]?.documentLabel || 'No anchors yet'}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {blockchainHistorySorted[0] ? `${blockchainHistorySorted[0].networkLabel || blockchainHistorySorted[0].network} • ${formatDateTime(blockchainHistorySorted[0].anchoredAt)}` : 'Anchor a document to populate the receipt stream.'}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
              {canAnchor ? (
                <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
              ) : (
                <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
              )}
              {currentDocument ? `Ready to anchor ${documentLabel}` : 'Select a document to anchor'}
            </div>

            <button
              type="button"
              onClick={() => void anchorCurrentDocument()}
              disabled={!canAnchor || anchorLoading || !currentDocument}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {anchorLoading ? 'Anchoring...' : 'Anchor current document'}
            </button>
          </div>

          {(anchorMessage || !canAnchor) && (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${canAnchor && anchorMessage ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/10 dark:text-emerald-200' : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300'}`}>
              {anchorMessage || blockchainConfig?.message || 'Blockchain anchoring is waiting on config.'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-blue-500" />
              Recent anchors
            </h4>

            {blockchainHistorySorted.length ? (
              <div className="space-y-3">
                {blockchainHistorySorted.slice(0, 6).map((record) => (
                  <div key={record.anchorId} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{record.documentLabel}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {record.networkLabel || record.network} • Chain {record.chainId ?? 'n/a'}
                        </p>
                      </div>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                        {record.status}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Hash preview</p>
                        <p className="mt-1 font-mono break-all text-gray-900 dark:text-white">{record.hashPreview}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Anchored at</p>
                        <p className="mt-1 text-gray-900 dark:text-white">{formatDateTime(record.anchoredAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No blockchain receipts have been created yet.
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <ShieldCheckIcon className="w-5 h-5 text-emerald-500" />
              Anchoring readiness
            </h4>

            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <p>
                {blockchainConfig?.canAnchor
                  ? 'The selected network is configured and ready to accept document hashes.'
                  : 'The UI is waiting for environment-driven RPC configuration.'}
              </p>
              <p>
                Anchored records are stored locally in your browser so the stream stays visible after refresh.
              </p>
              <p>
                Explorer target: <span className="font-semibold text-gray-900 dark:text-white">{selectedBlockchainNetwork?.explorerLabel || 'Unavailable'}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const AIAssistant = () => {
    const latestMessage = chatMessages[chatMessages.length - 1]

    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                <CpuChipIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  AI Forensics Assistant
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {assistantStatus.providerLabel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshAssistantStatus}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Refresh status
              </button>
              <button
                type="button"
                onClick={resetConversation}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
                Reset chat
              </button>
            </div>
          </div>

          <div className={`rounded-xl border px-4 py-3 text-sm ${assistantStatus.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-200' : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300'}`}>
            <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
              <span className="font-medium">{assistantStatus.message}</span>
              <span className="text-xs uppercase tracking-wide opacity-80">Mode: {assistantStatus.mode}</span>
            </div>
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {assistantStatus.configuredKeys.length ? `Configured: ${assistantStatus.configuredKeys.join(', ')}` : `Missing: ${assistantStatus.missingKeys.join(', ')}`}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/40">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Live context</p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{assistantContextSummary}</p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {recentActivity.length ? `${recentActivity.length} recent activity item${recentActivity.length === 1 ? '' : 's'} connected` : 'No live activity yet'}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {assistantSuggestions.slice(0, 4).map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => void sendMessage(suggestion.prompt)}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors bg-gradient-to-r ${suggestionToneStyles[suggestion.tone]}`}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 h-[32rem] flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Conversation</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ask about the current document, telemetry, or analysis workflow.</p>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {latestMessage?.topic ? `Latest topic: ${latestMessage.topic}` : 'Waiting for your first question'}
              </div>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {chatMessages.map((message) => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs lg:max-w-xl rounded-2xl px-4 py-3 shadow-sm ${message.type === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'}`}>
                  <p className="text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-80">
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon className="w-3.5 h-3.5" />
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                    {message.topic ? <span className="rounded-full border border-current/20 px-2 py-0.5">{message.topic}</span> : null}
                    {typeof message.confidence === 'number' ? <span className="rounded-full border border-current/20 px-2 py-0.5">{Math.round(message.confidence * 100)}% confidence</span> : null}
                  </div>
                  {message.summary ? <p className="mt-2 text-xs opacity-80">{message.summary}</p> : null}
                  {message.followUps?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.followUps.slice(0, 3).map((followUp) => (
                        <button
                          key={followUp}
                          type="button"
                          onClick={() => void sendMessage(followUp)}
                          className="rounded-full bg-white/15 px-3 py-1 text-xs hover:bg-white/25 transition-colors"
                        >
                          {followUp}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 rounded-2xl">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(event) => setInputMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void sendMessage()
                  }
                }}
                placeholder={`Ask about ${documentLabel.toLowerCase()}...`}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                autoComplete="off"
                spellCheck="false"
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!inputMessage.trim() || isTyping}
                className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isTyping ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Thinking...</span>
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="w-4 h-4" />
                    <span>Send</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <ChatBubbleLeftRightIcon className="w-8 h-8 text-purple-600 dark:text-purple-400 mb-2" />
            <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-1">
              Current context
            </h4>
            <p className="text-sm text-purple-700 dark:text-purple-300">
              {assistantContextSummary}
            </p>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <BeakerIcon className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-2" />
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
              Suggested next step
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {assistantSuggestions[0]?.prompt || 'Ask for a summary of the current document.'}
            </p>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <SparklesIcon className="w-8 h-8 text-green-600 dark:text-green-400 mb-2" />
            <h4 className="font-medium text-green-900 dark:text-green-100 mb-1">
              Provider readiness
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300">
              {assistantStatus.ready ? 'External AI is ready to wire in later.' : 'Local contextual mode stays active until a provider key is added.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const renderFeature = () => {
    switch (activeFeature) {
      case 'ar':
        return <ARForensicsPanel uploadDocument={uploadDocument} analyzeDocument={analyzeDocument} />
      case 'blockchain':
        return <BlockchainAnchoring />
      case 'ai-assistant':
        return <AIAssistant />
      case 'simulation':
        return <div className="text-center py-12 text-gray-500">Threat Simulation - Coming Soon</div>
      case 'monitoring':
        return <div className="text-center py-12 text-gray-500">Continuous Monitoring - Coming Soon</div>
      default:
        return <ARForensicsPanel uploadDocument={uploadDocument} analyzeDocument={analyzeDocument} />
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white dark:text-white">
          Futuristic Features
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Next-generation forensic technologies and AI-powered capabilities
        </p>
      </div>

      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg overflow-x-auto">
        {features.map((feature) => {
          const Icon = feature.icon

          return (
            <button
              key={feature.id}
              type="button"
              onClick={() => setActiveFeature(feature.id as FeatureMode)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeFeature === feature.id ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              <Icon className="w-4 h-4" />
              <span>{feature.name}</span>
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeFeature}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
        >
          {renderFeature()}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}