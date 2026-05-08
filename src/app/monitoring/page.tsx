'use client'

import { useEffect, useMemo, useState } from 'react'
import { dataService, type RealTimeStats, type RecentActivity, type SystemHealth } from '@/lib/data-service'

export default function MonitoringPage() {
  const [stats, setStats] = useState<RealTimeStats | null>(null)
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [activity, setActivity] = useState<RecentActivity[]>([])
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadMonitoringData = async () => {
      try {
        setIsLoading(true)
        const [nextStats, nextHealth, nextActivity] = await Promise.all([
          dataService.getRealTimeStats(),
          dataService.getSystemHealth(),
          dataService.getRecentActivity(10),
        ])

        if (!mounted) {
          return
        }

        setStats(nextStats)
        setHealth(nextHealth)
        setActivity(nextActivity)
        setLastSynced(new Date())
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadMonitoringData()

    const unsubscribeStats = dataService.subscribe('stats_updated', (nextStats: RealTimeStats) => {
      if (!mounted) {
        return
      }

      setStats(nextStats)
      setLastSynced(new Date())
    })

    const unsubscribeHealth = dataService.subscribe('health_updated', (nextHealth: SystemHealth) => {
      if (!mounted) {
        return
      }

      setHealth(nextHealth)
      setLastSynced(new Date())
    })

    const unsubscribeActivity = dataService.subscribe('activity_updated', (nextActivity: RecentActivity[]) => {
      if (!mounted) {
        return
      }

      setActivity(nextActivity)
      setLastSynced(new Date())
    })

    return () => {
      mounted = false
      unsubscribeStats()
      unsubscribeHealth()
      unsubscribeActivity()
    }
  }, [])

  const healthItems = useMemo(() => {
    if (!health) {
      return []
    }

    return [
      { label: 'AI Engine', value: health.aiEngine },
      { label: 'Database', value: health.database },
      { label: 'Risk Intel API', value: health.riskIntelApi },
      { label: 'Blockchain', value: health.blockchainService },
    ]
  }, [health])

  const statItems = useMemo(() => {
    if (!stats) {
      return []
    }

    return [
      { label: 'Documents Processed', value: stats.documentsProcessed.toLocaleString() },
      { label: 'Authenticity Rate', value: `${stats.authenticityRate.toFixed(1)}%` },
      { label: 'High Risk Flags', value: stats.highRiskFlags.toLocaleString() },
      { label: 'Average Processing Time', value: `${stats.avgProcessingTime.toFixed(1)}s` },
      { label: 'Active Analyses', value: stats.activeAnalyses.toLocaleString() },
      { label: 'System Status', value: stats.systemStatus },
    ]
  }, [stats])

  return (
    <div className="mobile-container py-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Continuous Monitoring</h1>
        <p className="text-sm text-gray-400">
          Live system telemetry driven by the current document store and service health, no hardcoded key values.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <h2 className="font-medium mb-2 text-white">System Health</h2>
          {isLoading && !health && <p className="text-sm text-gray-500">Loading…</p>}
          {!isLoading && healthItems.length === 0 && <p className="text-sm text-gray-500">No health data available</p>}
          {health && (
            <ul className="text-sm space-y-1 text-gray-300">
              {healthItems.map((item) => (
                <li key={item.label}>
                  {item.label}: <span className="font-semibold">{item.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="glass-card p-4">
          <h2 className="font-medium mb-2 text-white">Real-time Stats</h2>
          {isLoading && !stats && <p className="text-sm text-gray-500">Loading…</p>}
          {!isLoading && statItems.length === 0 && <p className="text-sm text-gray-500">No telemetry available</p>}
          {stats && (
            <ul className="text-sm space-y-1 text-gray-300">
              {statItems.map((item) => (
                <li key={item.label}>
                  {item.label}: <span className="font-semibold">{item.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="glass-card p-4">
          <h2 className="font-medium mb-2 text-white">Recent Activity</h2>
          {isLoading && activity.length === 0 && <p className="text-sm text-gray-500">Loading…</p>}
          {!isLoading && activity.length === 0 && <p className="text-sm text-gray-500">No recent activity</p>}
          <ul className="text-sm space-y-1 max-h-48 overflow-auto text-gray-300">
            {activity.map((a) => (
              <li key={a.id} className="flex justify-between">
                <span>{a.type}: {a.document}</span>
                <span className="text-gray-400">{a.time}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="text-xs text-gray-500">
        {lastSynced ? `Last synced ${lastSynced.toLocaleTimeString()}` : 'Waiting for live data...'}
      </div>
    </div>
  )
}