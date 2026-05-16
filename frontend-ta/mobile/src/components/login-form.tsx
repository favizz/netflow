"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { useTheme } from "next-themes"
import logoWhite from "@/assets/netflow-logo-white.png"

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void
          renderButton: (element: HTMLElement, config: object) => void
        }
      }
    }
  }
}

interface LoginFormProps {
  onGoogleLogin: (credential: string) => Promise<void>
}

export default function LoginForm({ onGoogleLogin }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const { resolvedTheme } = useTheme()
  const buttonRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)

  const handleCredential = async (response: { credential: string }) => {
    setIsLoading(true)
    setError("")
    try {
      await onGoogleLogin(response.credential)
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Login gagal"
      const parsed = (() => { try { return JSON.parse(raw) as { message?: string } } catch { return null } })()
      setError(parsed?.message ?? raw)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const init = () => {
      if (!window.google || !buttonRef.current || !GOOGLE_CLIENT_ID || initializedRef.current) return
      initializedRef.current = true
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: resolvedTheme === "dark" ? "filled_black" : "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: buttonRef.current.offsetWidth || 320,
        locale: "id",
      })
    }

    if (window.google) {
      init()
    } else {
      const interval = setInterval(() => {
        if (window.google) { clearInterval(interval); init() }
      }, 100)
      return () => clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme])

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-0 ring-1 ring-slate-200 dark:ring-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-xl">
        <div className="p-8 md:p-10 space-y-8">
          <div className="text-center space-y-3">
            <div className="flex justify-center mb-6">
              <img
                src={logoWhite}
                alt="NETFLOW"
                className="h-20 w-20 object-contain"
              />
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">NETFLOW</h1>
            <p className="text-base text-slate-500 dark:text-slate-400">Manajemen Utilitas Apartemen Anda</p>
          </div>

          <div className="flex flex-col items-center gap-4 pt-2">
            {isLoading && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
              </div>
            )}
            <div ref={buttonRef} className="flex justify-center w-full max-w-xs" />

            {error && (
              <p className="text-sm text-destructive text-center mt-2 font-medium">{error}</p>
            )}

            <div className="w-full border-t border-slate-200 dark:border-slate-800 mt-4 pt-6 text-center text-[12px] text-slate-400 dark:text-slate-500">
              By continuing, you confirm you are 18 or over and agree to our{" "}
              <a href="#" className="underline hover:text-slate-900 dark:hover:text-slate-300">Privacy Policy</a>{" "}
              and{" "}
              <a href="#" className="underline hover:text-slate-900 dark:hover:text-slate-300">Terms of Use</a>.
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
