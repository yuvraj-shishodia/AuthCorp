'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { DocumentUpload } from '@/components/document-upload'
import { Dashboard } from '@/components/dashboard'
import { ForensicAnalysis } from '@/components/forensic-analysis'
import { RiskIntelligence } from '@/components/risk-intelligence'
import { FuturisticFeatures } from '@/components/futuristic-features'
import MonitoringPage from '@/app/monitoring/page'
import BlockchainAnchoringPage from '@/app/blockchain/page'
import AIAssistantPage from '@/app/ai-assistant/page'
import { Navigation } from '@/components/navigation'
import { Header } from '@/components/header'
import { dataService, type RealTimeStats, type SystemHealth } from '@/lib/data-service'
import { 
  DocumentTextIcon, 
  ShieldCheckIcon, 
  EyeIcon, 
  ChartBarIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline'

type ActiveView = 'dashboard' | 'upload' | 'forensics' | 'risk-intelligence' | 'futuristic' | 'monitoring' | 'blockchain' | 'ai-assistant'

export default function Home() {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard')
  const [analysisData, setAnalysisData] = useState(null)
  const [liveStats, setLiveStats] = useState<RealTimeStats | null>(null)
  const [liveHealth, setLiveHealth] = useState<SystemHealth | null>(null)

  useEffect(() => {
    const handleNavigateToForensics = (event: CustomEvent) => {
      setActiveView('forensics')
      if (event.detail?.document) {
        setAnalysisData(event.detail.document.results)
      }
    }

    window.addEventListener('navigate-to-forensics', handleNavigateToForensics as EventListener)
    return () => {
      window.removeEventListener('navigate-to-forensics', handleNavigateToForensics as EventListener)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const loadLiveData = async () => {
      try {
        const [stats, health] = await Promise.all([
          dataService.getRealTimeStats(),
          dataService.getSystemHealth(),
        ])

        if (!mounted) {
          return
        }

        setLiveStats({ ...stats })
        setLiveHealth({ ...health })
      } catch (error) {
        console.error('Error loading live dashboard data:', error)
      }
    }

    loadLiveData()

    const unsubscribeStats = dataService.subscribe('stats_updated', (stats) => {
      if (mounted) {
        setLiveStats({ ...stats })
      }
    })

    const unsubscribeHealth = dataService.subscribe('health_updated', (health) => {
      if (mounted) {
        setLiveHealth({ ...health })
      }
    })

    const handleRefresh = () => {
      loadLiveData()
    }

    window.addEventListener('document-uploaded', handleRefresh)
    window.addEventListener('analysis-completed', handleRefresh)
    window.addEventListener('risk-check-completed', handleRefresh)

    const pollInterval = window.setInterval(loadLiveData, 1000)

    return () => {
      mounted = false
      unsubscribeStats()
      unsubscribeHealth()
      window.removeEventListener('document-uploaded', handleRefresh)
      window.removeEventListener('analysis-completed', handleRefresh)
      window.removeEventListener('risk-check-completed', handleRefresh)
      window.clearInterval(pollInterval)
    }
  }, [])

  const aiEngineStatus = liveHealth?.aiEngine ?? (liveStats ? (liveStats.systemStatus === 'operational' ? 'online' : liveStats.systemStatus === 'degraded' ? 'degraded' : 'offline') : null)
  const aiEngineStatusLabel = aiEngineStatus
    ? aiEngineStatus.charAt(0).toUpperCase() + aiEngineStatus.slice(1)
    : 'Loading'
  const aiEngineStatusClass = aiEngineStatus === 'online'
    ? 'text-blue-300'
    : aiEngineStatus === 'degraded'
      ? 'text-amber-300'
      : aiEngineStatus === 'offline'
        ? 'text-red-300'
        : 'text-gray-400'

  const navigationItems = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: ChartBarIcon,
      description: 'Overview and analytics'
    },
    {
      id: 'upload',
      name: 'Document Upload',
      icon: DocumentTextIcon,
      description: 'Upload and verify documents'
    },
    {
      id: 'forensics',
      name: 'Forensic Analysis',
      icon: EyeIcon,
      description: 'Deep document analysis'
    },
    {
      id: 'risk-intelligence',
      name: 'Risk Intelligence',
      icon: ShieldCheckIcon,
      description: 'Background and risk checks'
    },
    {
      id: 'futuristic',
      name: 'Futuristic Features',
      icon: CpuChipIcon,
      description: 'AR, Blockchain & AI Assistant'
    }
  ]

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <>
            <section className="mb-6">
              <div className="glass-card neon-border p-6 sm:p-8">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-blue))' }} />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-200">
                          AuthCorp AI Verification
                        </span>
                      </div>
                      <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
                        The Trust & Verification Platform for a Zero‑Trust World
                      </h2>
                    </div>
                    <p className="mt-3 text-sm sm:text-base text-gray-300">
                      Forensic document analysis, AI anomaly detection, blockchain anchoring, dark web intelligence, and advanced identity validation — flawlessly integrated and built to scale globally.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button type="button" onClick={() => setActiveView('monitoring')} className="btn-cyber">Launch Monitoring</button>
                      <button type="button" onClick={() => setActiveView('blockchain')} className="px-5 py-2.5 rounded-lg font-medium border border-white/10 text-white hover:bg-white/10 transition-colors">Anchor on Blockchain</button>
                      <button type="button" onClick={() => setActiveView('ai-assistant')} className="px-5 py-2.5 rounded-lg font-medium border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition-colors">Ask AI Assistant</button>
                    </div>
                  </div>
                  <div className="w-full max-w-md grid grid-cols-2 gap-3 lg:self-start">
                    <div className="glass-card p-4 min-w-0 overflow-hidden">
                      <p className="text-xs text-gray-400">Authenticity Rate</p>
                      <p className="mt-1 text-xl sm:text-2xl font-bold text-green-400 leading-tight truncate">
                        {liveStats ? `${liveStats.authenticityRate.toFixed(1)}%` : 'Loading...'}
                      </p>
                    </div>
                    <div className="glass-card p-4 min-w-0 overflow-hidden">
                      <p className="text-xs text-gray-400">High‑Risk Flags</p>
                      <p className="mt-1 text-xl sm:text-2xl font-bold text-red-400 leading-tight truncate">
                        {liveStats ? liveStats.highRiskFlags : 'Loading...'}
                      </p>
                    </div>
                    <div className="glass-card p-4 min-w-0 overflow-hidden">
                      <p className="text-xs text-gray-400">Documents Today</p>
                      <p className="mt-1 text-xl sm:text-2xl font-bold text-white leading-tight truncate">
                        {liveStats ? liveStats.documentsProcessed.toLocaleString() : 'Loading...'}
                      </p>
                    </div>
                    <div className="glass-card p-4 min-w-0 overflow-hidden">
                      <p className="text-xs text-gray-400">AI Engine Status</p>
                      <p className={`mt-1 text-xl sm:text-2xl font-bold leading-tight truncate ${aiEngineStatusClass}`}>
                        {aiEngineStatusLabel}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <Dashboard analysisData={analysisData} />
          </>
        )
      case 'upload':
        return <DocumentUpload onAnalysisComplete={setAnalysisData} />
      case 'forensics':
        return <ForensicAnalysis data={analysisData} />
      case 'risk-intelligence':
        return <RiskIntelligence data={analysisData} />
      case 'futuristic':
        return <FuturisticFeatures activeDocument={analysisData} />
      case 'monitoring':
        return <MonitoringPage />
      case 'blockchain':
        return <BlockchainAnchoringPage />
      case 'ai-assistant':
        return <AIAssistantPage />
      default:
        return <Dashboard analysisData={analysisData} />
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <Header />

      <div className="flex flex-1 flex-col lg:flex-row pt-4 lg:pt-6">
        {/* Mobile Navigation */}
        <div className="lg:hidden glass-card">
          <div className="mobile-container py-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                background: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-blue))'
              }}>
                <CpuChipIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">AuthCorp</h1>
                <p className="text-xs text-gray-300">AI Verification</p>
              </div>
            </div>
            <div className="flex space-x-1 overflow-x-auto pb-2">
              {navigationItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id as ActiveView)}
                    className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      activeView === item.id
                        ? 'text-white neon-border'
                        : 'text-gray-300 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="hidden sm:block">{item.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Desktop Sidebar */}
        <div className="hidden lg:block w-64 shrink-0 self-start">
          <div
            className="p-5 lg:sticky lg:top-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden"
            style={{
              boxShadow: '0 10px 24px rgba(2, 8, 23, 0.45), 0 0 14px rgba(56, 189, 248, 0.08)'
            }}
          >
            <div className="flex items-center space-x-3 mb-6 px-1">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                background: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-blue))'
              }}>
                <CpuChipIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">AuthCorp</h1>
                <p className="text-sm text-gray-300">AI Verification</p>
              </div>
            </div>
            <Navigation
              items={navigationItems}
              activeView={activeView}
              onViewChange={(view) => setActiveView(view as ActiveView)}
            />
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 mobile-container py-4 lg:p-6">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {renderActiveView()}
          </motion.div>
        </div>
      </div>
    </div>
  )
}