'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface User {
  id: string
  email: string
  name: string
  avatar?: string
  role: 'admin' | 'investigator' | 'analyst' | 'viewer'
  permissions: string[]
  organization?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => void
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/validate', { credentials: 'include' })
      if (response.ok) {
        const userData = await response.json()
        setUser(userData.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    try {
      setLoading(true)
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Login failed')
      }
      const data = await response.json()
      setUser(data.user)
      toast.success('Login successful')
      router.push('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed')
      throw error
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleToken = async (accessToken: string) => {
    const authResponse = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token: accessToken }),
    })
    if (!authResponse.ok) {
      const err = await authResponse.json()
      throw new Error(err.message || 'Google login failed')
    }
    const data = await authResponse.json()
    setUser(data.user)
    toast.success('Google login successful')
    router.push('/')
  }

  const loginWithGoogle = async () => {
    try {
      setLoading(true)

      if (!googleClientId) {
        throw new Error('Google sign-in is not configured.')
      }

      const runGoogleFlow = (googleObj: any) => {
        // Disable auto-select so it always shows account chooser
        try { googleObj.accounts.id.disableAutoSelect() } catch { /* ignore */ }

        const tokenClient = googleObj.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'email profile',
          prompt: 'select_account',
          callback: async (response: any) => {
            try {
              await handleGoogleToken(response.access_token)
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Google login failed')
            } finally {
              setLoading(false)
            }
          },
        } as any)

        tokenClient.requestAccessToken({ prompt: 'select_account' })
      }

      if (typeof window !== 'undefined' && (window as any).google) {
        runGoogleFlow((window as any).google)
      } else {
        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.onload = () => {
          if ((window as any).google) {
            runGoogleFlow((window as any).google)
          } else {
            toast.error('Google sign-in failed to load.')
            setLoading(false)
          }
        }
        script.onerror = () => {
          toast.error('Could not load Google sign-in.')
          setLoading(false)
        }
        document.head.appendChild(script)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Google login failed')
      setLoading(false)
    }
  }

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => {
      setUser(null)
      toast.success('Logged out successfully')
      router.push('/login')
    })
  }

  const hasPermission = (permission: string): boolean => {
    if (!user) return false
    return user.permissions.includes(permission) || user.role === 'admin'
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}