'use client'

import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ChartBarIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  InformationCircleIcon,
  XCircleIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CpuChipIcon,
  GlobeAltIcon,

} from '@heroicons/react/24/outline'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { useForensics } from '@/components/forensics-provider'
import { dataService, RealTimeStats, RecentActivity, TrendData, SystemHealth } from '@/lib/data-service'

interface DashboardProps {
  analysisData?: any
}

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#8b5cf6']

const getTimeRangeLabel = (range: string) => {
  switch (range) {
    case '24h':
      return 'Last 24 Hours'
    case '30d':
      return 'Last 30 Days'
    case '90d':
      return 'Last 90 Days'
    case '7d':
    default:
      return 'Last 7 Days'
  }
}

const formatTrendChange = (current: number, previous?: number | null) => {
  if (previous === undefined || previous === null) {
    return 'Live'
  }

  if (current === 0 && previous === 0) {
    return 'No data'
  }

  if (previous === 0) {
    return current === 0 ? '0.0%' : '+100.0%'
  }

  const delta = ((current - previous) / previous) * 100
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`
}

const getTrendDirection = (current: number, previous?: number | null) => {
  if (previous === undefined || previous === null) {
    return 'up' as const
  }

  if (current === 0 && previous === 0) {
    return 'neutral' as const
  }

  return current >= previous ? 'up' as const : 'down' as const
}

export function Dashboard({ analysisData }: DashboardProps) {
  const { state } = useForensics()
  const [timeRange, setTimeRange] = useState('')
  const [realTimeStats, setRealTimeStats] = useState<RealTimeStats | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Log when realTimeStats changes
  useEffect(() => {
    if (realTimeStats) {
      console.log('[Dashboard] realTimeStats CHANGED:', realTimeStats.documentsProcessed, 'docs')
    }
  }, [realTimeStats])

  const normalizeCategory = (raw: string | undefined) => String(raw || '').toLowerCase().replace(/_/g, '-')
  const isDeepfakeDocument = (doc: any) => {
    const category = normalizeCategory(doc?.results?.authenticity?.category)
    const reason = String(doc?.blockedReason || '').toLowerCase()
    return category === 'ai-generated' || reason.includes('deepfake') || reason.includes('ai-generated')
  }
  const buildSessionActivity = (): RecentActivity[] => (
    state.documents
      .filter(d => d.status === 'completed' || d.status === 'blocked')
      .map(d => ({
        id: d.id,
        type: isDeepfakeDocument(d) ? 'alert' as const : 'analysis' as const,
        document: d.filename,
        result: normalizeCategory(d.results?.authenticity?.category || 'unknown'),
        confidence: d.results?.authenticity?.confidence || 75,
        time: 'Just now',
        userId: 'current-user',
        riskLevel: isDeepfakeDocument(d)
          ? 'high'
          : ((d.results?.authenticity?.score || 75) > 70 ? 'low' : (d.results?.authenticity?.score || 75) > 40 ? 'medium' : 'high') as 'low' | 'medium' | 'high'
      }))
      .reverse()
  )
  const mergeActivity = (incoming: RecentActivity[]): RecentActivity[] => {
    const merged = new Map<string, RecentActivity>()
    ;[...buildSessionActivity(), ...incoming].forEach((item) => {
      if (!merged.has(item.id)) {
        merged.set(item.id, { ...item, result: normalizeCategory(item.result) })
      }
    })
    return Array.from(merged.values()).slice(0, 10)
  }

  const getTrendDays = (range: string) => {
    switch (range) {
      case '24h':
        return 1
      case '30d':
        return 30
      case '90d':
        return 90
      case '7d':
      default:
        return 7
    }
  }

  // Update activity feed when session documents change
  useEffect(() => {
    const sessionActivity = buildSessionActivity()
    if (sessionActivity.length > 0) {
      setRecentActivity(prev => mergeActivity(prev))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.documents.length])

  // Load real-time data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true)
        const [stats, activity, trends, health] = await Promise.all([
          dataService.getRealTimeStats(),
          dataService.getRecentActivity(10),
          dataService.getTrendData(getTrendDays(timeRange)),
          dataService.getSystemHealth()
        ])
        
        setRealTimeStats(stats)

        // Merge DB activity with current session documents
        setRecentActivity(mergeActivity(activity))
        setTrendData(trends)
        setSystemHealth(health)
      } catch (error) {
        console.error('Error loading dashboard data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()

    // Poll every 1 second for updates (simpler and more reliable than subscriptions)
    const pollInterval = setInterval(() => {
      console.log('[Dashboard] Polling for updates...')
      loadData()
    }, 1000)

    return () => clearInterval(pollInterval)
  }, [timeRange])

  // Transform trend data for charts
  const weeklyData = trendData.map(item => ({
    day: new Date(item.date).toLocaleDateString('en', { weekday: 'short' }),
    authentic: item.authentic,
    tampered: item.tampered,
    forged: item.forged,
    aiGenerated: item.aiGenerated
  }))

  const riskTrendData = trendData.map(item => ({
    time: new Date(item.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    riskScore: item.riskScore
  }))

  const latestTrend = trendData[trendData.length - 1]
  const latestTrendTotal = latestTrend
    ? latestTrend.authentic + latestTrend.tampered + latestTrend.forged + latestTrend.aiGenerated
    : null
  const latestTrendAuthenticityRate = latestTrend && latestTrendTotal && latestTrendTotal > 0
    ? (latestTrend.authentic / latestTrendTotal) * 100
    : latestTrend ? 0 : null
  const latestTrendRiskFlags = latestTrend
    ? latestTrend.tampered + latestTrend.forged + latestTrend.aiGenerated
    : null

  const categoryData = trendData.length > 0 ? [
    { name: 'Authentic', value: weeklyData.reduce((sum, day) => sum + day.authentic, 0), color: '#10b981' },
    { name: 'Tampered', value: weeklyData.reduce((sum, day) => sum + day.tampered, 0), color: '#ef4444' },
    { name: 'Forged', value: weeklyData.reduce((sum, day) => sum + day.forged, 0), color: '#f59e0b' },
    { name: 'AI Generated', value: weeklyData.reduce((sum, day) => sum + day.aiGenerated, 0), color: '#8b5cf6' },
  ] : []

  const timeRangeLabel = getTimeRangeLabel(timeRange)

  const stats = realTimeStats ? [
    {
      title: 'Documents Processed',
      value: realTimeStats.documentsProcessed.toLocaleString(),
      change: formatTrendChange(realTimeStats.documentsProcessed, latestTrendTotal),
      trend: getTrendDirection(realTimeStats.documentsProcessed, latestTrendTotal),
      icon: DocumentTextIcon,
      color: 'blue',
    },
    {
      title: 'Authenticity Rate',
      value: `${realTimeStats.authenticityRate.toFixed(1)}%`,
      change: formatTrendChange(realTimeStats.authenticityRate, latestTrendAuthenticityRate),
      trend: getTrendDirection(realTimeStats.authenticityRate, latestTrendAuthenticityRate),
      icon: ShieldCheckIcon,
      color: 'green',
    },
    {
      title: 'High Risk Flags',
      value: realTimeStats.highRiskFlags.toString(),
      change: formatTrendChange(realTimeStats.highRiskFlags, latestTrendRiskFlags),
      trend: getTrendDirection(realTimeStats.highRiskFlags, latestTrendRiskFlags),
      icon: ExclamationTriangleIcon,
      color: 'red',
    },
    {
      title: 'Avg Processing Time',
      value: `${realTimeStats.avgProcessingTime.toFixed(1)}s`,
      change: formatTrendChange(realTimeStats.avgProcessingTime, latestTrend?.avgProcessingTime ?? null),
      trend: getTrendDirection(realTimeStats.avgProcessingTime, latestTrend?.avgProcessingTime ?? null),
      icon: ClockIcon,
      color: 'purple',
    },
  ] : []

  const sessionDeepfakeCount = useMemo(() =>
    state.documents.filter((d) => isDeepfakeDocument(d)).length
  , [state.documents])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-300">Loading dashboard...</span>
      </div>
    )
  }

  const getResultColor = (result: string) => {
    switch (normalizeCategory(result)) {
      case 'authentic': return 'text-green-600 bg-green-100 dark:bg-green-900/20'
      case 'tampered': return 'text-red-600 bg-red-100 dark:bg-red-900/20'
      case 'forged': return 'text-orange-600 bg-orange-100 dark:bg-orange-900/20'
      case 'ai-generated': return 'text-purple-600 bg-purple-100 dark:bg-purple-900/20'
      case 'high_risk': return 'text-red-600 bg-red-100 dark:bg-red-900/20'
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20'
    }
  }

  const engineHealth = systemHealth?.aiEngine ?? (realTimeStats?.systemStatus === 'operational'
    ? 'online'
    : realTimeStats?.systemStatus === 'degraded'
      ? 'degraded'
      : 'offline')
  const engineStatusLabel = engineHealth === 'online'
    ? 'ACTIVE'
    : engineHealth === 'degraded'
      ? 'DEGRADED'
      : 'OFFLINE'
  const engineStatusClass = engineHealth === 'online'
    ? 'bg-emerald-500/90 text-white border border-emerald-300/30'
    : engineHealth === 'degraded'
      ? 'bg-amber-500/90 text-white border border-amber-300/30'
      : 'bg-red-500/90 text-white border border-red-300/30'
  const totalDeepfakes = realTimeStats?.deepfakesDetected ?? sessionDeepfakeCount
  const deepfakeAlertText = `🚨 ${totalDeepfakes} Deepfakes Detected - ${timeRangeLabel}`
  const engineSubtitle = realTimeStats
    ? `Monitoring ${realTimeStats.activeAnalyses} active analyses with ${realTimeStats.accuracyRate.toFixed(1)}% detection accuracy`
    : 'Loading live model telemetry...'
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            Forensics Dashboard
          </h1>
          <p className="text-sm sm:text-base text-gray-300">
            Real-time document verification and deepfake detection
          </p>
        </div>
        
        {/* Mobile-Friendly Deepfake Alert */}
        <div className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          {deepfakeAlertText}
        </div>
        
        <div className="flex items-center">
          <div className="relative">
            {timeRange === '' && (
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-300">
                Duration
              </span>
            )}
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="min-w-36 px-3 py-2 bg-white/5 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="" disabled>Duration</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Deepfake Detection Showcase */}
      <div className="rounded-xl p-4 sm:p-6 border border-white/10 bg-white/5 dark:bg-gray-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white mb-2">
              🤖 AI Deepfake Detection Engine
            </h2>
            <p className="text-sm text-gray-300">
              {engineSubtitle}
            </p>
          </div>
          <div className={`px-4 py-2 rounded-lg text-sm font-medium ${engineStatusClass}`}>
            {engineStatusLabel}
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
           <div className="text-center">
             <div className="text-xl sm:text-2xl font-bold text-red-400">
               {totalDeepfakes}
             </div>
             <div className="text-xs sm:text-sm text-gray-300">Deepfakes Blocked</div>
           </div>
           <div className="text-center">
             <div className="text-xl sm:text-2xl font-bold text-orange-400">
               {state.documents.filter((d) => normalizeCategory(d.results?.authenticity?.category) === 'ai-generated').length || realTimeStats?.faceSwapsDetected || 0}
             </div>
             <div className="text-xs sm:text-sm text-gray-300">Face Swaps</div>
           </div>
           <div className="text-center">
             <div className="text-xl sm:text-2xl font-bold text-purple-400">
               {realTimeStats?.ganGeneratedDetected || 0}
             </div>
             <div className="text-xs sm:text-sm text-gray-300">GAN Generated</div>
           </div>
           <div className="text-center">
             <div className="text-xl sm:text-2xl font-bold text-pink-400">
               {realTimeStats?.accuracyRate?.toFixed(1) ?? '0.0'}%
             </div>
             <div className="text-xs sm:text-sm text-gray-300">Accuracy Rate</div>
           </div>
         </div>
      </div>
      
      {/* Mobile-Optimized Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          const TrendIcon = stat.trend === 'up' ? ArrowTrendingUpIcon : ArrowTrendingDownIcon
          const isNeutralChange = stat.change === 'Live' || stat.change === 'No data'
          
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="mobile-card bg-white/5 dark:bg-gray-800 border border-white/10 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className={`p-3 rounded-lg bg-${stat.color}-100 dark:bg-${stat.color}-900/20`}>
                  <Icon className={`w-6 h-6 text-${stat.color}-600 dark:text-${stat.color}-400`} />
                </div>
                <div className={`flex items-center space-x-1 text-sm ${
                  isNeutralChange ? 'text-gray-400 dark:text-gray-500' : stat.trend === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {isNeutralChange ? <span className="w-4 h-4" /> : <TrendIcon className="w-4 h-4" />}
                  <span>{stat.change}</span>
                </div>
              </div>
              
              <div className="mt-4">
                <h3 className="text-2xl font-bold text-white">
                  {stat.value}
                </h3>
                <p className="text-sm text-gray-300 mt-1">
                  {stat.title}
                </p>
              </div>
            </motion.div>
          )
        })}
      </div>
      
      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Analysis Chart */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white/5 dark:bg-gray-800 rounded-xl p-6 border border-white/10"
        >
          <h3 className="text-lg font-semibold text-white mb-4">
            Analysis Results ({timeRangeLabel})
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="day" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                }}
              />
              <Bar dataKey="authentic" stackId="a" fill="#10b981" />
              <Bar dataKey="tampered" stackId="a" fill="#ef4444" />
              <Bar dataKey="forged" stackId="a" fill="#f59e0b" />
              <Bar dataKey="aiGenerated" stackId="a" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
        
        {/* Risk Trend Chart */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white/5 dark:bg-gray-800 rounded-xl p-6 border border-white/10"
        >
          <h3 className="text-lg font-semibold text-white mb-4">
            Risk Score Trend ({timeRangeLabel})
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={riskTrendData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="time" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                }}
              />
              <Line
                type="monotone"
                dataKey="riskScore"
                stroke="#ef4444"
                strokeWidth={3}
                dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
      
      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 dark:bg-gray-800 rounded-xl p-6 border border-white/10"
        >
          <h3 className="text-lg font-semibold text-white mb-4">
            Document Categories ({timeRangeLabel})
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {categoryData.map((item) => (
              <div key={item.name} className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-gray-300">
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
        
        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-white/5 dark:bg-gray-800 rounded-xl p-6 border border-white/10"
        >
          <h3 className="text-lg font-semibold text-white mb-4">
            Recent Activity
          </h3>
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between p-3 bg-white/5 dark:bg-gray-700/50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {activity.type === 'analysis' ? (
                      <EyeIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <ShieldCheckIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {activity.document}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {activity.time}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    getResultColor(activity.result)
                  }`}>
                    {activity.result.replace('_', ' ')}
                  </span>
                  <span className="text-sm text-gray-300">
                    {activity.confidence}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
      
      {/* Active Documents Status */}
      {state.documents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 dark:bg-gray-800 rounded-xl p-6 border border-white/10"
        >
          <h3 className="text-lg font-semibold text-white mb-4">
            Current Session Documents ({state.documents.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.documents.slice(0, 6).map((doc) => (
              <div
                key={doc.id}
                className="p-4 bg-white/5 dark:bg-gray-700/50 rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-white truncate">
                    {doc.filename}
                  </h4>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    doc.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                    doc.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                    'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                  }`}>
                    {doc.status}
                  </span>
                </div>
                {doc.results && (
                  <div className="text-xs text-gray-300">
                    {doc.results.authenticity.category} • {doc.results.authenticity.score.toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}