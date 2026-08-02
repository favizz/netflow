"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { Card } from "@/components/ui/card"
import logoWhite from "@/assets/netflow-logo-white.png"
import logoBlack from "@/assets/netflow-logo-black.png"

interface LoginFormProps {
  onGoogleLogin: (credential: string) => Promise<void>
}

export default function LoginForm({ onGoogleLogin }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const { resolvedTheme } = useTheme()

  const handleClick = async () => {
    setIsLoading(true)
    setError("")
    try {
      await onGoogleLogin("demo-credential")
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Login failed"
      const parsed = (() => { try { return JSON.parse(raw) as { message?: string } } catch { return null } })()
      setError(parsed?.message ?? raw)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-0 ring-1 ring-slate-200 dark:ring-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-xl">
        <div className="p-8 md:p-10 space-y-8">
          <div className="text-center space-y-3">
            <div className="flex justify-center mb-6">
              <img
                src={resolvedTheme === 'dark' ? logoWhite : logoBlack}
                alt="NETFLOW"
                className="h-20 w-20 object-contain"
              />
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">NETFLOW</h1>
            <p className="text-base text-slate-500 dark:text-slate-400">Your Apartment Utility Management</p>
          </div>

          <div className="flex flex-col items-center gap-4 pt-2">
            {isLoading && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleClick()}
              disabled={isLoading}
              className="flex items-center justify-center gap-3 w-[320px] max-w-full h-11 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-medium shadow-sm active:bg-slate-50 dark:active:bg-slate-800 transition-colors disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
              </svg>
              <span>{isLoading ? "Signing in..." : "Continue with Google"}</span>
            </button>

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
