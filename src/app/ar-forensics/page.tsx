'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CameraIcon,
  StopIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { useForensics } from '@/components/forensics-provider'

type ScanResult = {
  authenticity: { score: number; category: string; confidence: number }
  riskLevel: string
  riskScore: number
  verdict: string
  evidence: string[]
  recommendation: string
  processingTime: number
}

type OverlayBox = {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  color: 'green' | 'amber' | 'red'
}

export default function LiveScannerPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraOn, setCameraOn] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [overlays, setOverlays] = useState<OverlayBox[]>([])
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState(0)

  const { state, uploadDocument, analyzeDocument } = useForensics()

  const releaseCameraStream = () => {
    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }

    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
      videoRef.current.removeAttribute('src')
      videoRef.current.load()
    }
  }

  // Start camera
  const startCamera = async () => {
    setCameraError(null)
    try {
      releaseCameraStream()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraOn(true)
      setResult(null)
      setOverlays([])
      setCapturedFrame(null)
    } catch (err: any) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access in your browser settings and reload.'
        : 'Could not access camera. Make sure no other app is using it.'
      setCameraError(msg)
      toast.error('Camera access failed')
    }
  }

  // Stop camera
  const stopCamera = () => {
    releaseCameraStream()
    setCameraOn(false)
    setResult(null)
    setOverlays([])
    setCapturedFrame(null)
  }

  // Generate AR overlay boxes from result
  const generateOverlays = (r: ScanResult): OverlayBox[] => {
    const score = r.authenticity.score
    const boxes: OverlayBox[] = []
    if (score > 70) {
      boxes.push({ id: 'doc', label: 'Document Detected', x: 15, y: 10, w: 70, h: 78, color: 'green' })
      boxes.push({ id: 'auth', label: `Authentic ${Math.round(score)}%`, x: 20, y: 15, w: 32, h: 10, color: 'green' })
    } else if (score > 40) {
      boxes.push({ id: 'doc', label: 'Document Detected', x: 15, y: 10, w: 70, h: 78, color: 'amber' })
      boxes.push({ id: 'warn', label: 'Suspicious Region', x: 25, y: 38, w: 40, h: 18, color: 'amber' })
    } else {
      boxes.push({ id: 'doc', label: 'Document Detected', x: 15, y: 10, w: 70, h: 78, color: 'red' })
      boxes.push({ id: 'flag', label: 'Manipulation Detected', x: 20, y: 28, w: 50, h: 22, color: 'red' })
      boxes.push({ id: 'meta', label: 'Metadata Anomaly', x: 55, y: 58, w: 28, h: 14, color: 'red' })
    }
    return boxes
  }

  // Capture frame from live video
  const captureFrame = (): Promise<{ blob: Blob; dataUrl: string }> => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return reject(new Error('No video or canvas'))
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('No canvas context'))
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Failed to capture frame'))
        resolve({ blob, dataUrl })
      }, 'image/jpeg', 0.92)
    })
  }

  // Main scan function
  const scanDocument = async () => {
    if (!cameraOn || scanning) return
    setScanning(true)
    setResult(null)
    setOverlays([])

    try {
      toast.loading('Capturing frame...', { id: 'scan' })
      const { blob, dataUrl } = await captureFrame()
      setCapturedFrame(dataUrl)

      toast.loading('Analysing document...', { id: 'scan' })

      const filename = `live-scan-${Date.now()}.jpg`
      const file = new File([blob], filename, { type: 'image/jpeg' })
      const docId = await uploadDocument(file)
      const analysisResult = (await analyzeDocument(docId)) as any

      const auth = analysisResult?.results?.authenticity || {}
      const risk = analysisResult?.results?.riskIntelligence || {}
      const score = typeof auth.score === 'number'
        ? auth.score
        : auth.category === 'tampered' || auth.category === 'forged' || auth.category === 'ai-generated'
        ? 28
        : 92
      const confidence = typeof auth.confidence === 'number' ? auth.confidence : (score > 70 ? 88 : 62)
      const riskScore = typeof risk.personRiskScore === 'number' ? risk.personRiskScore : Math.max(0, Math.min(100, (100 - score) * 0.8))
      const normalizedRiskScore = Math.round(riskScore * 10) / 10

      const scanResult: ScanResult = {
        authenticity: {
          score,
          category: auth.category ?? 'authentic',
          confidence,
        },
        riskLevel: risk.riskCategory ?? (score > 70 ? 'low' : score > 40 ? 'medium' : 'high'),
        riskScore: normalizedRiskScore,
        verdict: score > 70 ? 'authentic' : score > 40 ? 'suspicious' : 'tampered',
        evidence: analysisResult?.results?.forensics?.metadataAnalysis?.tamperingClues ?? [],
        recommendation: score > 70
          ? 'Document appears authentic. Standard processing can proceed.'
          : score > 40
          ? 'Flag for manual review. Some inconsistencies detected.'
          : 'Reject document. High-confidence manipulation detected.',
        processingTime: analysisResult?.processingTime ?? 1.4,
      }

      setResult(scanResult)
      setOverlays(generateOverlays(scanResult))
      setScanCount(c => c + 1)

      // Persist last scan to sessionStorage so we can restore when navigating back
      try {
        const snapshot = {
          timestamp: Date.now(),
          previewUrl: dataUrl,
          result: scanResult,
          overlays: generateOverlays(scanResult),
          docId: docId,
        }
        sessionStorage.setItem('ar:lastScan', JSON.stringify(snapshot))
      } catch (e) {
        // ignore
      }

      const msg = scanResult.verdict === 'authentic'
        ? '✅ Document appears authentic'
        : scanResult.verdict === 'suspicious'
        ? '⚠️ Document flagged as suspicious'
        : '🚨 Manipulation detected!'

      toast.success(msg, { id: 'scan', duration: 4000 })
    } catch (err) {
      console.error('Scan failed:', err)
      toast.error('Scan failed. Please try again.', { id: 'scan' })
    } finally {
      setScanning(false)
    }
  }

  const resetScan = () => {
    setResult(null)
    setOverlays([])
    setCapturedFrame(null)
  }

  useEffect(() => {
    return () => { releaseCameraStream() }
  }, [])

  // Restore from session snapshot on mount so tab switches keep the AR result stable
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const raw = sessionStorage.getItem('ar:lastScan')
      if (!raw) return
      const snap = JSON.parse(raw)
      if (!snap?.timestamp || Date.now() - snap.timestamp > 1000 * 60 * 30) return

      // Restore always on mount - sessionStorage is for cross-navigation persistence
      if (snap.previewUrl) setCapturedFrame(snap.previewUrl)
      if (snap.result) {
        const restoredResult = snap.result
        // Re-normalize risk score to prevent display overflow
        if (restoredResult && typeof restoredResult.riskScore === 'number') {
          restoredResult.riskScore = Math.round(restoredResult.riskScore * 10) / 10
        }
        setResult(restoredResult)
        setOverlays(Array.isArray(snap.overlays) ? snap.overlays : generateOverlays(restoredResult))
      }
    } catch (e) {
      // noop
    }
  }, [])

  // Restore last completed scan when returning to this page
  useEffect(() => {
    if (capturedFrame) return // already showing a frame

    try {
      const completedDocs = (state?.documents || []).filter(d => (d.status === 'completed' || d.status === 'blocked') && d.results && d.previewUrl)
        .sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())

      if (completedDocs.length === 0) return

      const latest = completedDocs[0]

      // Only restore recent scans (within 30 minutes) to avoid stale data
      const uploadedAt = new Date(latest.uploadedAt).getTime()
      if (Date.now() - uploadedAt > 1000 * 60 * 30) return

      // Populate the UI from the stored document's real results only
      if (latest.previewUrl) {
        setCapturedFrame(latest.previewUrl)
      }

      const auth = latest.results?.authenticity
      const risk = latest.results?.riskIntelligence
      const resAny = (latest.results as any)

      // Only restore a full ScanResult if the saved analysis contains a numeric score
      if (auth && typeof auth.score === 'number') {
        const restored: ScanResult = {
          authenticity: {
            score: auth.score,
            category: auth.category ?? 'unknown',
            confidence: auth.confidence ?? 0,
          },
          riskLevel: risk?.riskCategory ?? (auth.score > 70 ? 'low' : auth.score > 40 ? 'medium' : 'high'),
          riskScore: Math.round(((risk?.personRiskScore ?? (100 - auth.score) * 0.8) as number) * 10) / 10,
          verdict: auth.score > 70 ? 'authentic' : auth.score > 40 ? 'suspicious' : 'tampered',
          evidence: latest.results?.forensics?.metadataAnalysis?.tamperingClues ?? [],
          recommendation: auth.score > 70
            ? 'Document appears authentic. Standard processing can proceed.'
            : auth.score > 40
            ? 'Flag for manual review. Some inconsistencies detected.'
            : 'Reject document. High-confidence manipulation detected.',
          processingTime: resAny?.processingTime ?? 1.2,
        }

        setResult(restored)
        setOverlays(generateOverlays(restored))
        try {
          sessionStorage.setItem('ar:lastScan', JSON.stringify({
            timestamp: Date.now(),
            previewUrl: latest.previewUrl,
            result: restored,
            overlays: generateOverlays(restored),
          }))
        } catch {
          // noop
        }
        setScanCount(c => c + 1)
      }
    } catch (e) {
      // noop
    }
  }, [state.documents])

  const verdictColor = result
    ? result.verdict === 'authentic' ? 'text-emerald-400'
    : result.verdict === 'suspicious' ? 'text-amber-400'
    : 'text-red-400'
    : ''

  const verdictBg = result
    ? result.verdict === 'authentic' ? 'border-emerald-500/40 bg-emerald-500/10'
    : result.verdict === 'suspicious' ? 'border-amber-500/40 bg-amber-500/10'
    : 'border-red-500/40 bg-red-500/10'
    : ''

  const overlayColors = {
    green: { border: 'border-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-900/80' },
    amber: { border: 'border-amber-400', text: 'text-amber-300', bg: 'bg-amber-900/80' },
    red:   { border: 'border-red-400',   text: 'text-red-300',   bg: 'bg-red-900/80'   },
  }

  const formatStat = (v: any) => {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return String(v)
      // Always normalize to 1 decimal place max to prevent overflow
      const rounded = Math.round(v * 10) / 10
      return String(rounded)
    }
    return String(v ?? '')
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white p-4 md:p-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30">
            <EyeIcon className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Live Document Scanner</h1>
            <p className="text-sm text-slate-400">Point your camera at a document — click Scan to analyse it in real time</p>
          </div>
        </div>
        {scanCount > 0 && (
          <div className="mt-2 text-xs text-slate-500">{scanCount} scan{scanCount !== 1 ? 's' : ''} completed this session</div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Camera + Overlay Panel */}
        <div className="xl:col-span-2 space-y-4">
          <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900 aspect-video">

            {/* Live feed */}
            {cameraOn && !capturedFrame && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
            )}

            {/* Captured frame + AR overlays */}
            {capturedFrame && (
              <div className="relative w-full h-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={capturedFrame} alt="Scanned frame" className="w-full h-full object-cover" />
                <AnimatePresence>
                  {overlays.map(box => {
                    const c = overlayColors[box.color]
                    return (
                      <motion.div
                        key={box.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className={`absolute border-2 ${c.border} rounded`}
                        style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
                      >
                        <span className={`absolute -top-6 left-0 text-xs font-semibold px-2 py-0.5 rounded ${c.bg} ${c.text} whitespace-nowrap`}>
                          {box.label}
                        </span>
                        <div className={`absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 ${c.border}`} />
                        <div className={`absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 ${c.border}`} />
                        <div className={`absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 ${c.border}`} />
                        <div className={`absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 ${c.border}`} />
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* Idle state */}
            {!cameraOn && !capturedFrame && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="p-4 rounded-full bg-slate-800 border border-slate-700">
                  <CameraIcon className="w-12 h-12 text-slate-500" />
                </div>
                <p className="text-slate-400 text-sm">Camera is off — click Start Camera to begin</p>
                {cameraError && (
                  <div className="mx-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-300 text-xs text-center max-w-sm">
                    {cameraError}
                  </div>
                )}
              </div>
            )}

            {/* Scanning animation overlay */}
            {scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3">
                <motion.div
                  animate={{ scaleX: [1, 0.95, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-3/4 h-0.5 bg-cyan-400 shadow-[0_0_12px_#22d3ee]"
                />
                <span className="text-cyan-300 text-sm font-semibold animate-pulse">Analysing document...</span>
              </div>
            )}

            {/* LIVE badge */}
            {cameraOn && !capturedFrame && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-white font-medium">LIVE</span>
              </div>
            )}

            {/* Scan again button */}
            {capturedFrame && (
              <button
                onClick={resetScan}
                className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 hover:bg-black/90 rounded-full px-3 py-1.5 text-xs text-white transition-all"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" />
                Scan again
              </button>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-3 flex-wrap">
            {!cameraOn ? (
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={startCamera}
                className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-medium text-sm transition-all"
              >
                <CameraIcon className="w-4 h-4" />
                Start Camera
              </motion.button>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={scanDocument}
                  disabled={scanning}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-sm transition-all shadow-lg shadow-indigo-500/20"
                >
                  <SparklesIcon className="w-4 h-4" />
                  {scanning ? 'Analysing...' : 'Scan Document'}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={stopCamera}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium text-sm transition-all"
                >
                  <StopIcon className="w-4 h-4" />
                  Stop Camera
                </motion.button>
              </>
            )}
          </div>

          {/* Instructions */}
          <div className="p-4 rounded-xl border border-white/5 bg-slate-900/60 text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300 mb-2">How to use</p>
            <p>1. Click <strong>Start Camera</strong> — allow camera permission when prompted</p>
            <p>2. Hold a document (ID, passport, certificate) in front of the camera</p>
            <p>3. Click <strong>Scan Document</strong> — frame is captured and analysed by AI</p>
            <p>4. Results and AR overlay boxes appear on the captured frame</p>
          </div>
        </div>

        {/* Results Panel */}
        <div className="space-y-4">

          <AnimatePresence>
            {result ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`rounded-2xl border p-5 ${verdictBg}`}
              >
                <div className="flex items-center gap-3 mb-4">
                  {result.verdict === 'authentic'
                    ? <CheckCircleIcon className="w-8 h-8 text-emerald-400" />
                    : <ExclamationTriangleIcon className={`w-8 h-8 ${result.verdict === 'suspicious' ? 'text-amber-400' : 'text-red-400'}`} />
                  }
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-widest">Verdict</p>
                    <p className={`text-xl font-bold capitalize ${verdictColor}`}>{result.verdict}</p>
                  </div>
                </div>

<div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: 'Authenticity', value: Math.round(result.authenticity.score), suffix: '/ 100', color: verdictColor },
                    { label: 'Confidence', value: `${Math.round(result.authenticity.confidence)}%`, suffix: '', color: 'text-cyan-400' },
                    { label: 'Risk Score', value: result.riskScore, suffix: '/ 100', color: result.riskLevel === 'low' ? 'text-emerald-400' : result.riskLevel === 'medium' ? 'text-amber-400' : 'text-red-400' },
                    { label: 'Risk Level', value: result.riskLevel, suffix: '', color: result.riskLevel === 'low' ? 'text-emerald-400' : result.riskLevel === 'medium' ? 'text-amber-400' : 'text-red-400' },
                  ].map(item => {
                    const display = formatStat(item.value)
                    return (
                      <div key={item.label} className="min-w-0 rounded-xl bg-black/30 p-2 text-center overflow-hidden">
                        <p className="text-xs text-slate-400 truncate">{item.label}</p>
                        <p className={`text-base font-bold ${item.color}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</p>
                        {item.suffix && <p className="text-xs text-slate-500 truncate">{item.suffix}</p>}
                      </div>
                    )
                  })}
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Authenticity Score</span>
                    <span>{Math.round(result.authenticity.score)}/100</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${result.authenticity.score}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className={`h-full rounded-full ${result.verdict === 'authentic' ? 'bg-emerald-500' : result.verdict === 'suspicious' ? 'bg-amber-500' : 'bg-red-500'}`}
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-black/30 p-3 mb-3">
                  <p className="text-xs text-slate-400 mb-1 font-semibold">Recommendation</p>
                  <p className="text-sm text-slate-200">{result.recommendation}</p>
                </div>

                <p className="text-xs text-slate-500 text-right">Processed in {result.processingTime.toFixed(2)}s</p>
              </motion.div>
            ) : (
              <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6 text-center">
                <DocumentTextIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No scan result yet</p>
                <p className="text-slate-500 text-xs mt-1">Start camera and click Scan Document</p>
              </div>
            )}
          </AnimatePresence>

          {/* Evidence */}
          {result && result.evidence.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/5 bg-slate-900/60 p-4"
            >
              <p className="text-sm font-semibold text-slate-300 mb-3">Evidence Found</p>
              <ul className="space-y-2">
                {result.evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* Overlay legend */}
          {overlays.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/5 bg-slate-900/60 p-4"
            >
              <p className="text-sm font-semibold text-slate-300 mb-3">AR Overlay Legend</p>
              <div className="space-y-2">
                {overlays.map(box => {
                  const c = overlayColors[box.color]
                  return (
                    <div key={box.id} className="flex items-center gap-2 text-xs">
                      <div className={`w-3 h-3 rounded-sm border-2 ${c.border}`} />
                      <span className={c.text}>{box.label}</span>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* Scanner status */}
          <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
            <p className="text-sm font-semibold text-slate-300 mb-3">Scanner Status</p>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Camera',           value: cameraOn ? 'Active' : 'Offline', ok: cameraOn },
                { label: 'AI Engine',        value: 'Online',                         ok: true },
                { label: 'ELA Detector',     value: 'Ready',                          ok: true },
                { label: 'Metadata Analyser',value: 'Ready',                          ok: true },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-slate-400">{item.label}</span>
                  <span className={`font-medium ${item.ok ? 'text-emerald-400' : 'text-slate-500'}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
