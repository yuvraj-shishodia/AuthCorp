'use client'

import { useEffect, useState } from 'react'

interface HydrationGateProps {
  children: React.ReactNode
}

export function HydrationGate({ children }: HydrationGateProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    // Render a minimal shell to avoid server/client markup mismatch
    return <div className="min-h-screen" />
  }
  return <>{children}</>
}