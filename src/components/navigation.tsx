'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { HeroIcon } from '@/types/icons'
import { dataService, type RealTimeStats, type SystemHealth } from '@/lib/data-service'

interface NavigationItem {
  id: string
  name: string
  icon: HeroIcon
  description: string
}

interface NavigationProps {
  items: NavigationItem[]
  activeView: string
  onViewChange: (view: string) => void
}

export function Navigation({ items, activeView, onViewChange }: NavigationProps) {
  const [liveStats, setLiveStats] = useState<RealTimeStats | null>(null)
  const [liveHealth, setLiveHealth] = useState<SystemHealth | null>(null)

  useEffect(() => {
    let mounted = true

    const loadLiveSidebarData = async () => {
      try {
        const [stats, health] = await Promise.all([
          dataService.getRealTimeStats(),
          dataService.getSystemHealth(),
        ])

        if (!mounted) {
          return
        }

        setLiveStats(stats)
        setLiveHealth(health)
      } catch (error) {
        console.error('Error loading navigation stats:', error)
      }
    }

    loadLiveSidebarData()

    const unsubscribeStats = dataService.subscribe('stats_updated', setLiveStats)
    const unsubscribeHealth = dataService.subscribe('health_updated', setLiveHealth)

    return () => {
      mounted = false
      unsubscribeStats()
      unsubscribeHealth()
    }
  }, [])

  const serviceStatusItems = liveHealth
    ? [
        { label: 'AI Engine', status: liveHealth.aiEngine },
        { label: 'Database', status: liveHealth.database },
        { label: 'Risk Intel API', status: liveHealth.riskIntelApi },
      ]
    : []

  const getServiceTone = (status: 'online' | 'offline' | 'degraded') => {
    switch (status) {
      case 'online':
        return 'bg-emerald-500'
      case 'degraded':
        return 'bg-amber-500'
      case 'offline':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const quickStats = [
    {
      label: 'Documents Today',
      value: liveStats ? liveStats.documentsProcessed.toLocaleString() : '—',
      tone: 'text-white',
    },
    {
      label: 'Authenticity Rate',
      value: liveStats ? `${liveStats.authenticityRate.toFixed(1)}%` : '—',
      tone: 'text-green-400',
    },
    {
      label: 'High Risk Flags',
      value: liveStats ? liveStats.highRiskFlags.toString() : '—',
      tone: 'text-red-400',
    },
  ]

  return (
    <nav className="h-full flex flex-col">
      <div className="space-y-1">
        {items.map((item, index) => {
          const isActive = activeView === item.id
          const Icon = item.icon
          
          return (
            <motion.button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02, x: 4 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left transition-all duration-200 group ${
                isActive
                  ? 'text-white neon-border'
                  : 'text-gray-300 hover:bg-white/10 border border-white/10'
              }`}
              style={isActive ? { background: 'linear-gradient(135deg, rgba(0,255,240,0.12), rgba(56,189,248,0.12))' } : {}}
            >
              <div className={`p-2 rounded-lg transition-all ${
                isActive 
                  ? 'bg-white/10' 
                  : 'bg-white/5 group-hover:bg-white/10'
              }`}>
                <Icon className={`w-5 h-5 transition-all ${
                  isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className={`font-medium block truncate ${
                  isActive ? 'text-white' : 'text-white'
                }`}>
                  {item.name}
                </span>
                <p className={`text-xs mt-0.5 truncate ${
                  isActive ? 'text-blue-200' : 'text-gray-300'
                }`}>
                  {item.description}
                </p>
              </div>
              
              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="activeIndicator"
                  className="w-2 h-2 bg-white rounded-full shadow-sm"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              {!isActive && (
                <div className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full opacity-0 group-hover:opacity-50 transition-opacity" />
              )}
            </motion.button>
          )
        })}
      </div>
      
      <div className="mt-4 pt-5 border-t border-white/10 space-y-6">
        {/* Quick Stats */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Quick Stats
          </h3>
          <div className="space-y-3">
            {quickStats.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                <span className="text-sm text-gray-300">{item.label}</span>
                <span className={`text-sm font-semibold ${item.tone}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* System Health */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            System Health
          </h3>
          <div className="space-y-2">
            {serviceStatusItems.length > 0 ? serviceStatusItems.map((service) => (
              <div key={service.label} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                <div className="flex items-center space-x-2 min-w-0">
                  <div className={`w-2 h-2 rounded-full ${getServiceTone(service.status)}`} />
                  <span className="text-xs text-gray-300 truncate">{service.label}</span>
                </div>
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${service.status === 'online' ? 'text-emerald-300' : service.status === 'degraded' ? 'text-amber-300' : 'text-red-300'}`}>
                  {service.status}
                </span>
              </div>
            )) : (
              <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-gray-400">
                Loading live service health...
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}