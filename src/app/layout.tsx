import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from 'react-hot-toast'
import { HydrationGate } from '@/components/hydration-gate'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AuthCorp - AI-Powered Document Verification Platform',
  description: 'Next-generation AI-powered platform for document verification, forgery detection, and risk intelligence analysis.',
  keywords: 'document verification, forgery detection, AI forensics, risk intelligence, fraud prevention',
  authors: [{ name: 'AuthCorp Team' }],
  robots: 'noindex, nofollow',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body className={`${inter.className} h-full cyber-bg antialiased overflow-x-hidden`} suppressHydrationWarning>
        <HydrationGate>
          <Providers>
            <div className="min-h-full">
              {children}
            </div>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
                success: {
                  style: {
                    background: '#10b981',
                  },
                },
                error: {
                  style: {
                    background: '#ef4444',
                  },
                },
              }}
            />
          </Providers>
        </HydrationGate>
      </body>
    </html>
  )
}