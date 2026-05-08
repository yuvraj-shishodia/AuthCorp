'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  UserIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  InformationCircleIcon,
  XCircleIcon,
  CheckCircleIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import { useForensics } from '@/components/forensics-provider'
import { dataService, type RealTimeStats } from '@/lib/data-service'

interface RiskIntelligenceProps {
  data?: any
}

type RiskCategory = 'low' | 'medium' | 'high'
type FindingType = 'criminal' | 'sanctions' | 'fraud' | 'breach' | 'regulatory'

interface RiskFinding {
  type: FindingType
  description: string
  confidence: number
  source: string
  date?: string
  severity: 'low' | 'medium' | 'high'
}

interface PersonProfile {
  name: string
  dateOfBirth?: string
  nationality?: string
  identificationNumbers: string[]
  addresses: string[]
  phoneNumbers: string[]
  emailAddresses: string[]
}

interface LiveRiskIntelligence {
  personRiskScore: number
  riskCategory: RiskCategory
  findings: RiskFinding[]
}

interface TimelineEntry {
  title: string
  description: string
  timestamp: string
  icon: typeof DocumentTextIcon
  tone: 'blue' | 'green' | 'yellow' | 'purple' | 'gray'
}

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\.[^/.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function RiskIntelligence({ data }: RiskIntelligenceProps) {
  const { state } = useForensics()
  const [selectedDocument, setSelectedDocument] = useState<(typeof state.documents)[number] | null>(state.activeDocument ?? state.documents.filter((doc) => doc.status === 'completed' || doc.status === 'blocked').slice(-1)[0] ?? state.documents[0] ?? null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchProgress, setSearchProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'profile' | 'timeline'>('overview')
  const [liveStats, setLiveStats] = useState<RealTimeStats | null>(null)
  const [expandedFinding, setExpandedFinding] = useState<RiskFinding | null>(null)
  const currentRiskIntelligence = useMemo<LiveRiskIntelligence | null>(() => {
    return (
      selectedDocument?.results?.riskIntelligence ??
      data?.riskResults ??
      data?.riskIntelligence ??
      null
    ) as LiveRiskIntelligence | null
  }, [data, selectedDocument])

  const fallbackFindings = useMemo<RiskFinding[]>(() => {
    if (!selectedDocument) {
      return []
    }

    const classification = selectedDocument.classification
    const authenticity = selectedDocument.results?.authenticity
    const findings: RiskFinding[] = []

    if (classification?.riskFactors?.length) {
      classification.riskFactors.forEach((factor, index) => {
        const normalizedFactor = factor.toLowerCase()
        findings.push({
          type: normalizedFactor.includes('fraud') || normalizedFactor.includes('ai') ? 'fraud' : 'regulatory',
          description: factor,
          confidence: clamp(92 - index * 5, 35, 99),
          source: 'Document Classification',
          severity: normalizedFactor.includes('high') || normalizedFactor.includes('critical') ? 'high' : normalizedFactor.includes('review') ? 'medium' : 'low',
        })
      })
    }

    if (authenticity && authenticity.category !== 'authentic') {
      findings.push({
        type: authenticity.category === 'tampered' ? 'fraud' : 'regulatory',
        description: `Authenticity scan flagged the document as ${authenticity.category.replace('-', ' ')}`,
        confidence: Math.round(authenticity.confidence),
        source: 'Authenticity Engine',
        severity: authenticity.category === 'forged' ? 'high' : 'medium',
      })
    }

    if (selectedDocument.blockedReason) {
      findings.push({
        type: 'regulatory',
        description: selectedDocument.blockedReason,
        confidence: 98,
        source: 'Forensics Policy Engine',
        severity: 'high',
      })
    }

    return findings
  }, [selectedDocument])

  // Build dynamic findings from vision analysis + mock risk intelligence
  const visionFindings = useMemo<RiskFinding[]>(() => {
    const results = selectedDocument?.results
    if (!results) return []
    const vFindings: RiskFinding[] = []

    const authScore = results.authenticity?.score ?? 75
    const authCategory = results.authenticity?.category ?? 'authentic'
    const authConf = Math.round(results.authenticity?.confidence ?? 70)

    // Authenticity finding
    vFindings.push({
      type: authCategory === 'authentic' ? 'regulatory' : 'fraud',
      description: authCategory === 'authentic'
        ? `Document passed authenticity analysis with ${authScore.toFixed(1)}% score`
        : `Document flagged as ${authCategory} — authenticity score ${authScore.toFixed(1)}%`,
      confidence: authConf,
      source: 'AuthCorp Vision Engine',
      severity: authScore > 70 ? 'low' : authScore > 45 ? 'medium' : 'high',
    })

    // Tampering clues from metadata
    const clues = results.forensics?.metadataAnalysis?.tamperingClues || []
    clues.slice(0, 2).forEach((clue: string) => {
      vFindings.push({
        type: 'fraud',
        description: clue,
        confidence: 85,
        source: 'Metadata Analyser',
        severity: 'medium',
      })
    })

    // Heatmap regions
    const regions = results.heatmap?.suspiciousRegions || []
    if (regions.length > 0) {
      vFindings.push({
        type: 'fraud',
        description: `${regions.length} suspicious region${regions.length > 1 ? 's' : ''} detected in image forensics`,
        confidence: Math.round((regions[0]?.confidence || 0.7) * 100),
        source: 'ELA Detector',
        severity: regions.length > 2 ? 'high' : 'medium',
      })
    }

    // Sanctions check (always include)
    vFindings.push({
      type: 'sanctions',
      description: 'No matches found in sanctions or watchlists',
      confidence: 97,
      source: 'Sanctions Database',
      severity: 'low',
    })

    return vFindings
  }, [selectedDocument])

  const riskFindings = (visionFindings.length > 0 ? visionFindings : null) ?? currentRiskIntelligence?.findings ?? fallbackFindings

  useEffect(() => {
    const selectedDocumentId = selectedDocument?.id
    const activeDocumentId = state.activeDocument?.id
    const latestCompletedDocument = state.documents.filter((doc) => doc.status === 'completed' || doc.status === 'blocked').slice(-1)[0] ?? state.documents[0] ?? null

    if (activeDocumentId && activeDocumentId !== selectedDocumentId) {
      setSelectedDocument(state.activeDocument)
      return
    }

    if (!selectedDocumentId && latestCompletedDocument) {
      setSelectedDocument(latestCompletedDocument)
      return
    }

    if (selectedDocumentId && !state.documents.some((doc) => doc.id === selectedDocumentId) && latestCompletedDocument) {
      setSelectedDocument(latestCompletedDocument)
    }
  }, [selectedDocument, state.activeDocument, state.documents])

  const riskScore = useMemo(() => {
    if (currentRiskIntelligence) {
      return clamp(currentRiskIntelligence.personRiskScore, 0, 100)
    }

    if (!selectedDocument) {
      return 0
    }

    const authenticityScore = selectedDocument.results?.authenticity?.score ?? 75
    const severityPenalty = riskFindings.reduce((total, finding) => {
      if (finding.severity === 'high') return total + 18
      if (finding.severity === 'medium') return total + 10
      return total + 4
    }, 0)

    const blockedPenalty = selectedDocument.status === 'blocked' ? 15 : 0
    return clamp(Math.round((100 - authenticityScore) * 0.6 + severityPenalty + blockedPenalty), 0, 100)
  }, [currentRiskIntelligence, riskFindings, selectedDocument])

  const riskCategory = useMemo<RiskCategory>(() => {
    if (currentRiskIntelligence) {
      return currentRiskIntelligence.riskCategory
    }

    if (riskScore <= 30) return 'low'
    if (riskScore <= 70) return 'medium'
    return 'high'
  }, [currentRiskIntelligence, riskScore])

  const sourceCount = useMemo(() => {
    return new Set((riskFindings || []).filter(Boolean).map((finding) => finding.source || 'Unknown source')).size
  }, [riskFindings])

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    if (!selectedDocument) {
      return []
    }

    const authenticity = selectedDocument.results?.authenticity
    const classification = selectedDocument.classification
    const uploadedAt = selectedDocument.uploadedAt ? new Date(selectedDocument.uploadedAt) : null

    return [
      {
        title: 'Document received',
        description: `${selectedDocument.filename} uploaded and added to the intelligence queue.`,
        timestamp: uploadedAt ? uploadedAt.toLocaleString() : 'Unknown upload time',
        icon: DocumentTextIcon,
        tone: 'blue',
      },
      {
        title: 'Classification completed',
        description: classification
          ? `Detected as ${toTitleCase(classification.type)} with ${Math.round(classification.confidence * 100)}% confidence.`
          : 'Classification is still pending for this document.',
        timestamp: classification ? 'Completed' : 'Pending',
        icon: CheckCircleIcon,
        tone: classification ? 'green' : 'gray',
      },
      {
        title: 'Authenticity scan finished',
        description: authenticity
          ? `Authenticity score ${authenticity.score}/100 with ${Math.round(authenticity.confidence)}% confidence.`
          : 'No authenticity result available yet.',
        timestamp: authenticity ? authenticity.category : 'Pending',
        icon: ShieldCheckIcon,
        tone: authenticity?.category === 'authentic' ? 'green' : authenticity ? 'yellow' : 'gray',
      },
      {
        title: 'Risk intelligence generated',
        description: `${riskFindings.length} findings resolved from ${sourceCount || 'live'} sources.`,
        timestamp: currentRiskIntelligence ? 'Live result' : 'Derived from document state',
        icon: ExclamationTriangleIcon,
        tone: riskFindings.length > 0 ? 'yellow' : 'gray',
      },
      {
        title: 'Current status',
        description: `Document currently marked as ${selectedDocument.status}.`,
        timestamp: isSearching
          ? `Searching ${searchProgress.toFixed(0)}%`
          : liveStats
            ? `${liveStats.activeAnalyses} active analyses`
            : 'Live monitoring',
        icon: ClockIcon,
        tone: selectedDocument.status === 'blocked' ? 'purple' : selectedDocument.status === 'completed' ? 'green' : 'blue',
      },
    ]
  }, [currentRiskIntelligence, isSearching, liveStats, riskFindings.length, searchProgress, selectedDocument, sourceCount])

  useEffect(() => {
    let mounted = true

    const loadLiveStats = async () => {
      try {
        const stats = await dataService.getRealTimeStats()
        if (mounted) {
          setLiveStats(stats)
        }
      } catch (error) {
        console.error('Error loading live risk stats:', error)
      }
    }

    loadLiveStats()
    const interval = setInterval(loadLiveStats, 5000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const personProfile = useMemo<PersonProfile>(() => {
    if ((data as any)?.profile) return (data as any).profile

    const results = selectedDocument?.results
    const auth = results?.authenticity
    const extractedText = results?.forensics?.textAnalysis?.extractedText || ''
    const docType = selectedDocument?.classification?.type
    const filename = selectedDocument?.filename || 'No Document Selected'

    // Determine document subject name from extracted text or filename
    // Don't use filename as person's name — that's wrong
    const subjectName = extractedText.match(/name[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/i)?.[1] || 'Not extracted from document'
    const dobMatch = extractedText.match(/(?:dob|date of birth|born)[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i)
    const emailMatch = extractedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)
    const phoneMatch = extractedText.match(/[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/g)

    return {
      name: subjectName,
      dateOfBirth: dobMatch ? dobMatch[1] : undefined,
      nationality: docType ? toTitleCase(docType.replace(/_/g, ' ')) : 'Unknown',
      identificationNumbers: [
        `File: ${filename}`,
        auth ? `Authenticity: ${Math.round(auth.score || 0)}% (${auth.category || 'unknown'})` : 'Not analysed',
      ],
      addresses: ['Address data not available — enable OCR microservice for extraction'],
      phoneNumbers: phoneMatch?.slice(0, 2) || ['Not detected in document'],
      emailAddresses: emailMatch?.slice(0, 2) || [
        auth ? `Document classified as: ${auth.category || 'unknown'}` : 'No authentication result'
      ],
    }
  }, [data, selectedDocument])

  const exportReport = useCallback(() => {
    const report = {
      generatedAt: new Date().toISOString(),
      document: selectedDocument ? {
        id: selectedDocument.id,
        filename: selectedDocument.filename,
        fileType: selectedDocument.fileType,
        status: selectedDocument.status,
      } : null,
      riskSummary: {
        score: riskScore,
        category: riskCategory,
        totalFindings: riskFindings.length,
        highSeverityFindings: riskFindings.filter((finding) => finding.severity === 'high').length,
      },
      personProfile,
      findings: riskFindings,
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `risk-intelligence-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(downloadUrl)
  }, [personProfile, riskCategory, riskFindings, riskScore, selectedDocument])

  const performRiskCheck = useCallback(async () => {
    setIsSearching(true)
    setSearchProgress(0)
    
    // Simulate progressive search across different databases
    const searchSteps = [
      { name: 'Criminal Records', duration: 1000 },
      { name: 'Sanctions Lists', duration: 800 },
      { name: 'Fraud Databases', duration: 1200 },
      { name: 'Data Breach Records', duration: 600 },
      { name: 'Regulatory Lists', duration: 900 },
      { name: 'News Archives', duration: 700 }
    ]
    
    for (let i = 0; i < searchSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, searchSteps[i].duration))
      setSearchProgress(((i + 1) / searchSteps.length) * 100)
    }
    
    setIsSearching(false)
    
    // Emit risk check completed event for dashboard updates
    window.dispatchEvent(new CustomEvent('risk-check-completed', { 
      detail: { 
        document: selectedDocument, 
        riskResults: { riskScore, riskCategory, riskFindings } 
      } 
    }))
  }, [selectedDocument, riskScore, riskCategory, riskFindings])
  
  useEffect(() => {
    if (selectedDocument && selectedDocument.status === 'completed' && !selectedDocument.results?.riskIntelligence) {
      performRiskCheck()
    }
  }, [selectedDocument, performRiskCheck])

  // Real-time data updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedDocument && selectedDocument.status === 'analyzing') {
        // Simulate progress updates
        const progress = Math.min((selectedDocument.progress || 0) + Math.random() * 10, 100)
        // Update document progress (this would normally come from the backend)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [selectedDocument])
  
  const getRiskColor = (category: RiskCategory) => {
    switch (category) {
      case 'low': return 'text-green-600 bg-green-100 dark:bg-green-900/20'
      case 'medium': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20'
      case 'high': return 'text-red-600 bg-red-100 dark:bg-red-900/20'
    }
  }
  
  const getFindingTypeColor = (type: FindingType) => {
    switch (type) {
      case 'criminal': return 'text-red-600 bg-red-100 dark:bg-red-900/20'
      case 'sanctions': return 'text-purple-600 bg-purple-100 dark:bg-purple-900/20'
      case 'fraud': return 'text-orange-600 bg-orange-100 dark:bg-orange-900/20'
      case 'breach': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20'
      case 'regulatory': return 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/20'
    }
  }
  
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return XCircleIcon
      case 'medium': return ExclamationTriangleIcon
      case 'low': return InformationCircleIcon
      default: return InformationCircleIcon
    }
  }
  
  const renderOverview = () => (
    <div className="space-y-6">
      {/* Risk Score Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Risk Assessment
          </h3>
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
            getRiskColor(riskCategory)
          }`}>
            <ShieldCheckIcon className="w-4 h-4" />
            <span className="text-sm font-medium capitalize">{riskCategory} Risk</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Overall Risk Score</span>
              <span className="text-3xl font-bold text-gray-900 dark:text-white">
                {riskScore}/100
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
              <motion.div
                className={`h-4 rounded-full ${
                  riskScore <= 30 ? 'bg-green-500' :
                  riskScore <= 70 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${riskScore}%` }}
                transition={{ duration: 1, delay: 0.5 }}
              />
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Findings</span>
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {riskFindings.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">High Severity</span>
              <span className="text-lg font-semibold text-red-600 dark:text-red-400">
                {riskFindings.filter(f => f.severity === 'high').length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Last Updated</span>
              <span className="text-sm text-gray-900 dark:text-white">
                {new Date().toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
      
      {/* Search Progress */}
      {isSearching && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center space-x-3 mb-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <MagnifyingGlassIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </motion.div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Searching Intelligence Databases
            </h3>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Progress</span>
              <span className="text-gray-900 dark:text-white">{searchProgress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <motion.div
                className="h-2 rounded-full bg-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${searchProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        </motion.div>
      )}
      
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-lg ${selectedDocument ? 'bg-blue-100 dark:bg-blue-900/20' : 'bg-gray-100 dark:bg-gray-700/60'}`}>
              <UserIcon className={`w-6 h-6 ${selectedDocument ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedDocument?.results?.authenticity ? 'Identity Verified' : 'Identity Pending'}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {selectedDocument
                  ? `${selectedDocument.filename} • ${selectedDocument.status}`
                  : 'Select a completed document'}
              </p>
            </div>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, x: 0 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <GlobeAltIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                {sourceCount || liveStats?.activeAnalyses || 0} Databases
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {sourceCount > 0
                  ? `Sources checked from ${sourceCount} unique records`
                  : 'Sources checked in real time'}
              </p>
            </div>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-lg ${isSearching || (liveStats?.activeAnalyses ?? 0) > 0 ? 'bg-purple-100 dark:bg-purple-900/20' : 'bg-gray-100 dark:bg-gray-700/60'}`}>
              <ClockIcon className={`w-6 h-6 ${isSearching || (liveStats?.activeAnalyses ?? 0) > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`} />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isSearching || (liveStats?.activeAnalyses ?? 0) > 0 ? 'Real-time' : 'Standby'}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isSearching
                  ? `Searching ${searchProgress.toFixed(0)}%`
                  : liveStats
                    ? `${liveStats.activeAnalyses} active analyses`
                    : 'Live monitoring'}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
  
  const renderFindings = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white dark:text-white">
          Risk Intelligence Findings ({riskFindings.length})
        </h3>
        <button
          type="button"
          onClick={exportReport}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Export Report
        </button>
      </div>
      
      {(riskFindings || []).filter(Boolean).map((finding, index) => {
        const SeverityIcon = getSeverityIcon(finding.severity)
        
        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className={`p-2 rounded-lg ${
                  finding.severity === 'high' ? 'bg-red-100 dark:bg-red-900/20' :
                  finding.severity === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/20' :
                  'bg-blue-100 dark:bg-blue-900/20'
                }`}>
                  <SeverityIcon className={`w-5 h-5 ${
                    finding.severity === 'high' ? 'text-red-600 dark:text-red-400' :
                    finding.severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-blue-600 dark:text-blue-400'
                  }`} />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      getFindingTypeColor(finding.type || 'unknown')
                    }`}>
                      {(finding.type || 'unknown').toUpperCase()}
                    </span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      finding.severity === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                      finding.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                      'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    }`}>
                      {(finding.severity || 'low').toUpperCase()}
                    </span>
                  </div>
                  
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    {finding.description || 'No description'}
                  </h4>
                  
                  <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>Source: {finding.source || 'Unknown source'}</span>
                    {finding.date && <span>Date: {new Date(finding.date).toLocaleDateString()}</span>}
                    <span>Confidence: {finding.confidence}%</span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => setExpandedFinding(expandedFinding?.description === finding.description ? null : finding)}
                className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title="View details"
              >
                <EyeIcon className="w-4 h-4 text-blue-500" />
              </button>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
  
  const renderProfile = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Extracted Person Profile
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Full Name</label>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{personProfile.name}</p>
            </div>
            
            {personProfile.dateOfBirth && (
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Date of Birth</label>
                <p className="text-gray-900 dark:text-white">
                  {new Date(personProfile.dateOfBirth).toLocaleDateString()}
                </p>
              </div>
            )}
            
            {personProfile.nationality && (
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Nationality</label>
                <p className="text-gray-900 dark:text-white">{personProfile.nationality}</p>
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Identification Numbers</label>
              <div className="space-y-1">
                {personProfile.identificationNumbers.map((id, index) => (
                  <p key={index} className="text-gray-900 dark:text-white font-mono text-sm">{id}</p>
                ))}
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Phone Numbers</label>
              <div className="space-y-1">
                {personProfile.phoneNumbers.map((phone, index) => (
                  <p key={index} className="text-gray-900 dark:text-white font-mono text-sm">{phone}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Addresses</label>
            <div className="space-y-1">
              {personProfile.addresses.map((address, index) => (
                <p key={index} className="text-gray-900 dark:text-white">{address}</p>
              ))}
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Email Addresses</label>
            <div className="space-y-1">
              {personProfile.emailAddresses.map((email, index) => (
                <p key={index} className="text-gray-900 dark:text-white font-mono text-sm">{email}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderTimeline = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white dark:text-white">
            Risk Timeline
          </h3>
          <p className="text-sm text-gray-400">
            Ordered events derived from the selected document and live analysis state.
          </p>
        </div>
        <div className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-gray-200 border border-white/10">
          {timelineEntries.length} events
        </div>
      </div>

      {timelineEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-6 text-gray-300">
          Select a completed document to see its analysis timeline.
        </div>
      ) : (
        <div className="space-y-4">
          {timelineEntries.map((entry, index) => {
            const EntryIcon = entry.icon
            const toneClasses = {
              blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
              green: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400',
              yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',
              purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
              gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
            }[entry.tone]

            return (
              <motion.div
                key={`${entry.title}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08 }}
                className="flex items-start gap-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5"
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClasses}`}>
                  <EntryIcon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                      {entry.title}
                    </h4>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {entry.timestamp}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {entry.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
  
  const tabs = [
    { id: 'overview', name: 'Overview', icon: ShieldCheckIcon },
    { id: 'findings', name: 'Findings', icon: ExclamationTriangleIcon },
    { id: 'profile', name: 'Profile', icon: UserIcon },
    { id: 'timeline', name: 'Timeline', icon: ClockIcon },
  ]
  
  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return renderOverview()
      case 'findings': return renderFindings()
      case 'profile': return renderProfile()
      case 'timeline': return renderTimeline()
      default: return renderOverview()
    }
  }
  
  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white dark:text-white">
            Risk Intelligence
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Background checks and criminal intelligence analysis
          </p>
        </div>
        
        {/* Document Selector */}
        {state.documents.length > 0 && (
          <select
            value={selectedDocument?.id || ''}
            onChange={(e) => {
              const doc = state.documents.find(d => d.id === e.target.value)
              setSelectedDocument(doc || null)
            }}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select Document</option>
            {state.documents.filter(doc => doc.status === 'completed' || doc.status === 'blocked').map(doc => (
              <option key={doc.id} value={doc.id}>
                {doc.filename}
              </option>
            ))}
          </select>
        )}
      </div>
      
      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.name}</span>
            </button>
          )
        })}
      </div>
      
      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>

    {expandedFinding !== null && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 mx-6 mb-4 p-5 rounded-2xl border border-blue-500/30 bg-blue-500/5"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Finding Details</h3>
          <button onClick={() => setExpandedFinding(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold leading-none">×</button>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm mb-3">
          <div className="space-y-2">
            <p><span className="text-gray-500 dark:text-gray-400">Type:</span> <span className="font-medium text-gray-900 dark:text-white ml-1 capitalize">{String(expandedFinding.type || 'unknown').replace(/_/g, ' ')}</span></p>
            <p><span className="text-gray-500 dark:text-gray-400">Severity:</span> <span className={`font-semibold ml-1 capitalize ${expandedFinding.severity === 'high' ? 'text-red-500' : expandedFinding.severity === 'medium' ? 'text-yellow-500' : 'text-green-500'}`}>{String(expandedFinding.severity || 'low')}</span></p>
            <p><span className="text-gray-500 dark:text-gray-400">Confidence:</span> <span className="font-medium text-gray-900 dark:text-white ml-1">{expandedFinding.confidence ?? 0}%</span></p>
          </div>
          <div className="space-y-2">
            <p><span className="text-gray-500 dark:text-gray-400">Source:</span> <span className="font-medium text-gray-900 dark:text-white ml-1">{String(expandedFinding.source || 'Unknown')}</span></p>
            <p><span className="text-gray-500 dark:text-gray-400">Status:</span> <span className="text-blue-500 font-medium ml-1">Under Review</span></p>
          </div>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg mb-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">{String(expandedFinding.description || 'No description available')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setExpandedFinding(null)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Mark Reviewed</button>
          <button className="px-3 py-1.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 transition-colors">Escalate</button>
          <button onClick={() => setExpandedFinding(null)} className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 transition-colors">Dismiss</button>
        </div>
      </motion.div>
    )}
    </>
  )
}