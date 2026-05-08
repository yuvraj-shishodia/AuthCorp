'use client'

import { Fragment, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  BellIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { Dialog, Menu, Transition } from '@headlessui/react'
import { useAuth } from '@/components/auth-provider'
import { useForensics } from '@/components/forensics-provider'
import { dataService, type RecentActivity, type RealTimeStats, type SystemHealth } from '@/lib/data-service'
import toast from 'react-hot-toast'

type NotificationTone = 'warning' | 'success' | 'info' | 'error'

interface HeaderNotification {
  id: string
  title: string
  message: string
  time: string
  type: NotificationTone
}

const normalizeCategory = (raw: string | undefined) => String(raw || '').toLowerCase().replace(/_/g, '-')

const isDeepfakeDoc = (doc: any) => {
  const category = normalizeCategory(doc?.results?.authenticity?.category)
  const reason = String(doc?.blockedReason || '').toLowerCase()
  return category === 'ai-generated' || reason.includes('deepfake') || reason.includes('ai-generated')
}

const mapActivityToNotification = (activity: RecentActivity): HeaderNotification => {
  const normalized = normalizeCategory(activity.result)
  const isAlert = activity.riskLevel === 'high' || ['tampered', 'forged', 'ai-generated', 'high-risk'].includes(normalized)

  return {
    id: `activity-${activity.id}`,
    title: isAlert ? `${normalized.replace(/-/g, ' ')} document flagged` : 'Analysis completed',
    message: `${activity.document} • ${activity.confidence.toFixed(1)}% confidence`,
    time: activity.time,
    type: isAlert ? 'warning' : 'success',
  }
}

const buildNotifications = (
  recentActivity: RecentActivity[],
  stats: RealTimeStats | null,
  health: SystemHealth | null
): HeaderNotification[] => {
  const notifications: HeaderNotification[] = recentActivity.slice(0, 3).map(mapActivityToNotification)

  if (stats) {
    if (stats.deepfakesDetected > 0) {
      notifications.unshift({
        id: 'deepfake-alert',
        title: `${stats.deepfakesDetected} deepfake${stats.deepfakesDetected === 1 ? '' : 's'} detected`,
        message: `Monitoring ${stats.activeAnalyses} active analysis${stats.activeAnalyses === 1 ? '' : 'es'} with ${stats.highRiskFlags} high-risk flag${stats.highRiskFlags === 1 ? '' : 's'}.`,
        time: 'Live now',
        type: 'error',
      })
    }

    if (stats.highRiskFlags > 0 && notifications.length < 4) {
      notifications.push({
        id: 'high-risk-summary',
        title: 'High-risk activity detected',
        message: `${stats.highRiskFlags} documents currently need review.`,
        time: 'Live now',
        type: 'warning',
      })
    }
  }

  if (health) {
    const serviceStates = [
      ['AI Engine', health.aiEngine],
      ['Database', health.database],
      ['Risk Intel API', health.riskIntelApi],
      ['Blockchain', health.blockchainService],
    ] as const

    const unhealthyServices = serviceStates.filter(([, status]) => status !== 'online')

    if (unhealthyServices.length > 0) {
      notifications.push({
        id: 'system-health-alert',
        title: 'System health needs attention',
        message: unhealthyServices.map(([label, status]) => `${label}: ${status}`).join(' • '),
        time: 'Live now',
        type: unhealthyServices.some(([, status]) => status === 'offline') ? 'error' : 'warning',
      })
    } else {
      notifications.push({
        id: 'system-health-ok',
        title: 'System status nominal',
        message: `All monitored services are online. Last checked ${health.lastChecked.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
        time: 'Just now',
        type: 'info',
      })
    }
  }

  if (notifications.length === 0) {
    notifications.push({
      id: 'live-monitoring',
      title: 'Live monitoring active',
      message: 'The notification feed is connected and waiting for the next event.',
      time: 'Just now',
      type: 'info',
    })
  }

  return notifications.slice(0, 5)
}

export function Header() {
  const { user, logout } = useAuth()
  const { state: forensicsState } = useForensics()
  const router = useRouter()
  const [notifications, setNotifications] = useState<HeaderNotification[]>([])
  const [liveStats, setLiveStats] = useState<RealTimeStats | null>(null)
  const [liveHealth, setLiveHealth] = useState<SystemHealth | null>(null)
  const [activePanel, setActivePanel] = useState<'profile' | 'preferences' | null>(null)
  const notificationCount = notifications.length

  // Update notifications from session documents
  useEffect(() => {
    const sessionDocs = forensicsState.documents.filter(d => d.status === 'completed' || d.status === 'blocked')
    if (sessionDocs.length > 0) {
      const sessionNotifications: HeaderNotification[] = sessionDocs.slice(-3).reverse().map(doc => ({
        id: doc.id,
        title: doc.status === 'blocked' ? 'Document Blocked' : 'Analysis Complete',
        message: doc.status === 'blocked'
          ? `${doc.filename} blocked — AI/deepfake content detected`
          : `${doc.filename} — ${doc.results?.authenticity?.category || 'authentic'} (${Math.round(doc.results?.authenticity?.score || 75)}% authentic)`,
        time: 'Just now',
        type: (doc.status === 'blocked' ? 'error' : 
              (doc.results?.authenticity?.score || 100) < 60 ? 'warning' : 'success') as NotificationTone,
      }))
      setNotifications(prev => {
        const dbNotifs = prev.filter(n => !forensicsState.documents.find(d => d.id === n.id))
        return [...sessionNotifications, ...dbNotifs].slice(0, 10)
      })
    }
  }, [forensicsState.documents])

  useEffect(() => {
    let mounted = true

    const loadNotifications = async () => {
      try {
        const [stats, recentActivity, health] = await Promise.all([
          dataService.getRealTimeStats(),
          dataService.getRecentActivity(5),
          dataService.getSystemHealth(),
        ])

        if (!mounted) {
          return
        }

        setLiveStats(stats)
        setLiveHealth(health)
        setNotifications(buildNotifications(recentActivity, stats, health))
      } catch (error) {
        console.error('Error loading header notifications:', error)
      }
    }

    loadNotifications()

    const refreshNotifications = () => {
      void loadNotifications()
    }

    const unsubscribeStats = dataService.subscribe('stats_updated', refreshNotifications)
    const unsubscribeActivity = dataService.subscribe('activity_updated', refreshNotifications)
    const unsubscribeHealth = dataService.subscribe('health_updated', refreshNotifications)

    return () => {
      mounted = false
      unsubscribeStats()
      unsubscribeActivity()
      unsubscribeHealth()
    }
  }, [])

  const serviceStates = liveHealth
    ? [liveHealth.aiEngine, liveHealth.database, liveHealth.riskIntelApi, liveHealth.blockchainService]
    : []
  const hasOfflineService = serviceStates.includes('offline')
  const hasDegradedService = serviceStates.includes('degraded')
  const systemStatusLabel = liveHealth
    ? hasOfflineService
      ? 'Needs Attention'
      : hasDegradedService
        ? 'Degraded'
        : 'All Systems Operational'
    : 'Loading Status'
  // Use session documents to populate live stats
  const sessionAnalyzing = forensicsState.documents.filter(d => d.status === 'analyzing').length

  const sessionDeepfakes = useMemo(() =>
    forensicsState.documents.filter((d) => isDeepfakeDoc(d)).length
  , [forensicsState.documents])
  const activeAnalyses = sessionAnalyzing + (liveStats?.activeAnalyses ?? 0)
  const deepfakesDetected = liveStats?.deepfakesDetected ?? sessionDeepfakes
  const activePanelTitle = activePanel === 'profile' ? 'Profile Settings' : 'System Preferences'
  const activePanelDescription = activePanel === 'profile'
    ? 'Review the current signed-in account details and copy the account email.'
    : 'Jump to live system views from one place.'

  const closePanel = () => {
    setActivePanel(null)
  }

  // Give the profile panel one useful action instead of another dead label.
  const copyEmail = async () => {
    if (!user?.email) {
      return
    }

    try {
      await navigator.clipboard.writeText(user.email)
      toast.success('Email copied to clipboard')
    } catch (error) {
      toast.error('Unable to copy email')
    }
  }

  return (
    <Fragment>
      <header className="glass-card neon-border sticky top-0 z-50">
        <div className="mobile-container py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3 sm:gap-6">
          {/* Logo and Title */}
          <div className="flex min-w-0 items-center space-x-2 sm:space-x-4">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="flex min-w-0 items-center space-x-2 sm:space-x-3"
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded-lg sm:h-8 sm:w-8"
                style={{
                  background: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-blue))',
                }}
              >
                <ShieldCheckIcon className="h-4 w-4 text-white sm:h-5 sm:w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white sm:text-xl">
                  AuthCorp
                </h1>
                <p className="hidden text-xs text-gray-400 sm:block">
                  AI-Powered Document Verification
                </p>
              </div>
            </motion.div>
          </div>

          {/* Mobile Status Indicators */}
          <div className="hidden items-center space-x-2 sm:flex sm:space-x-6">
            <div className="hidden items-center space-x-2 md:flex">
              <div className={`h-2 w-2 animate-pulse rounded-full ${hasOfflineService ? 'bg-red-500' : hasDegradedService ? 'bg-yellow-500' : 'bg-green-500'}`} />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {systemStatusLabel}
              </span>
            </div>

            <div
              className="flex items-center space-x-1 rounded-full px-2 py-1 sm:space-x-2 sm:px-3"
              style={{
                background: 'linear-gradient(90deg, rgba(56,189,248,0.12), rgba(0,255,240,0.12))',
              }}
            >
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              <span className="text-xs font-medium text-blue-300 sm:text-sm">
                <span className="hidden sm:inline">{activeAnalyses} Active Analyses</span>
                <span className="sm:hidden">{activeAnalyses} Active</span>
              </span>
            </div>

            <div
              className="flex items-center space-x-1 rounded-full px-2 py-1"
              style={{
                background: 'linear-gradient(90deg, rgba(255,0,234,0.12), rgba(0,255,240,0.08))',
              }}
            >
              <span className="text-xs font-medium text-red-300">
                  🚨 <span className="hidden sm:inline">Deepfakes:</span> {deepfakesDetected}
              </span>
            </div>
          </div>

          {/* Right Side Controls */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            {/* Notifications */}
            <Menu as="div" className="relative">
              <Menu.Button className="relative rounded-xl border border-white/10 bg-white/5 p-2.5 transition-all duration-200 hover:bg-white/10 hover:border-white/20 hover:shadow-[0_0_18px_rgba(59,130,246,0.18)]">
                <BellIcon className="h-5 w-5 text-white/80" />
                {notificationCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-white/20 bg-gradient-to-r from-red-500 to-pink-500 px-1.5 text-[10px] font-semibold leading-none text-white shadow-lg shadow-red-500/30 ring-2 ring-slate-950">
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </span>
                )}
              </Menu.Button>

              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-700 bg-slate-950 text-white shadow-2xl focus:outline-none">
                  <div className="p-4">
                    <h3 className="mb-3 text-sm font-semibold text-white">
                      Live Notifications
                    </h3>
                    <div className="space-y-3">
                      {notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className="rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10"
                        >
                          <div className="flex items-start space-x-3">
                            <div
                              className={`mt-1 h-3 w-3 rounded-full ${
                                notification.type === 'warning' ? 'bg-yellow-500' :
                                notification.type === 'error' ? 'bg-red-500' :
                                notification.type === 'info' ? 'bg-blue-500' :
                                'bg-green-500'
                              }`}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-white">
                                {notification.title}
                              </p>
                              <p className="mt-1 text-xs text-gray-300">
                                {notification.message}
                              </p>
                              <p className="mt-1 text-xs text-gray-400">
                                {notification.time}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>

            {/* Enhanced User Menu */}
            {user ? (
              <Menu as="div" className="relative">
                <Menu.Button className="flex items-center space-x-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-all duration-200 hover:bg-white/10">
                  <div className="relative">
                    {user.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="h-8 w-8 rounded-full"
                      />
                    ) : (
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-full"
                        style={{
                          background: 'linear-gradient(135deg, var(--neon-pink), var(--neon-blue))',
                        }}
                      >
                        <span className="text-sm font-semibold text-white">
                          {user?.name?.charAt(0) || 'U'}
                        </span>
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-sm font-semibold text-white">
                      {user?.name || 'Research Team'}
                    </p>
                    <p className="text-xs text-gray-300">
                      Administrator
                    </p>
                  </div>
                </Menu.Button>

                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl focus:outline-none">
                    <div className="py-1">
                      <div
                        className="border-b border-white/10 px-4 py-4"
                        style={{
                          background: 'linear-gradient(90deg, rgba(56,189,248,0.08), rgba(0,255,240,0.06))',
                        }}
                      >
                        <p className="text-sm font-semibold text-white">
                          {user.name}
                        </p>
                        <p className="text-xs text-gray-300">
                          {user.email}
                        </p>
                        <p className="mt-1 text-xs font-medium capitalize text-blue-300">
                          {user.role} • Final Year Project
                        </p>
                      </div>
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            type="button"
                            onClick={() => setActivePanel('profile')}
                            className={`${active ? 'bg-white/10' : ''} flex w-full items-center px-4 py-3 text-sm text-gray-300 transition-colors hover:text-white`}
                          >
                            <UserCircleIcon className="mr-3 h-4 w-4" />
                            Profile Settings
                          </button>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            type="button"
                            onClick={() => setActivePanel('preferences')}
                            className={`${active ? 'bg-white/10' : ''} flex w-full items-center px-4 py-3 text-sm text-gray-300 transition-colors hover:text-white`}
                          >
                            <Cog6ToothIcon className="mr-3 h-4 w-4" />
                            System Preferences
                          </button>
                        )}
                      </Menu.Item>
                      <hr className="my-1 border-gray-200" />
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={logout}
                            className={`${active ? 'bg-white/10' : ''} flex w-full items-center px-4 py-3 text-sm text-red-400 transition-colors hover:text-red-300`}
                          >
                            <ArrowRightOnRectangleIcon className="mr-3 h-4 w-4" />
                            Sign out
                          </button>
                        )}
                      </Menu.Item>
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>
            ) : (
              <motion.a
                href="/login"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 font-semibold text-white shadow-lg transition-all duration-200 hover:from-blue-700 hover:to-indigo-700"
              >
                Sign In
              </motion.a>
            )}
          </div>
        </div>
      </div>
      </header>

      <Transition
        as={Fragment}
        show={activePanel !== null}
      >
        <Dialog as="div" className="relative z-[60]" onClose={closePanel}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 z-[60] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 text-white shadow-2xl">
                  <div className="border-b border-white/10 px-6 py-5">
                    <Dialog.Title className="text-lg font-semibold text-white">
                      {activePanelTitle}
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-slate-300">
                      {activePanelDescription}
                    </Dialog.Description>
                  </div>

                  {activePanel === 'profile' ? (
                    <div className="space-y-4 px-6 py-5">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Signed in as</p>
                        <p className="mt-2 text-base font-semibold text-white">{user?.name || 'Research Team'}</p>
                        <p className="text-sm text-slate-300">{user?.email || 'No email available'}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Role</p>
                          <p className="mt-2 font-medium capitalize text-white">{user?.role || 'Unknown'}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Organization</p>
                          <p className="mt-2 font-medium text-white">{user?.organization || 'AuthCorp'}</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Permissions</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {user?.permissions?.length ? (
                            user.permissions.map((permission) => (
                              <span key={permission} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                                {permission}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-slate-400">No permissions assigned.</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 pt-2">
                        <button
                          type="button"
                          onClick={copyEmail}
                          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                        >
                          Copy email
                        </button>
                        <button
                          type="button"
                          onClick={closePanel}
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 px-6 py-5">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Theme</p>
                        <p className="mt-2 text-sm text-slate-200">This build keeps the dark system theme locked in place.</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => {
                            closePanel()
                            router.push('/monitoring')
                          }}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-white/10"
                        >
                          Open Monitoring
                          <span className="mt-1 block text-xs text-slate-400">View live telemetry and service health.</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closePanel()
                            router.push('/blockchain')
                          }}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-white/10"
                        >
                          Open Blockchain
                          <span className="mt-1 block text-xs text-slate-400">Inspect anchor readiness and receipts.</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closePanel()
                            router.push('/ai-assistant')
                          }}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-white/10"
                        >
                          Open AI Assistant
                          <span className="mt-1 block text-xs text-slate-400">Ask about live document context.</span>
                        </button>
                        <button
                          type="button"
                          onClick={closePanel}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-slate-200 transition hover:bg-white/10"
                        >
                          Close
                          <span className="mt-1 block text-xs text-slate-400">Dismiss this panel.</span>
                        </button>
                      </div>
                    </div>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </Fragment>
  )
}