"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Lock, Home } from "lucide-react"

interface LoginFormProps {
  onLogin: () => void
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleGoogleLogin = () => {
    setIsLoading(true)
    // Simulate Google login
    setTimeout(() => {
      onLogin()
      setIsLoading(false)
    }, 800)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-0 ring-1 ring-slate-200 dark:ring-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-xl">
        <div className="p-8 md:p-10 space-y-8">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="flex justify-center mb-6">
              <div className="bg-primary text-primary-foreground p-4 rounded-2xl shadow-md rotate-3 hover:rotate-0 transition-transform duration-300">
                <Home size={40} />
              </div>
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">Penghuni</h1>
            <p className="text-base text-slate-500 dark:text-slate-400">Manajemen Utilitas Apartemen Anda</p>
          </div>

          {/* Form */}
          <div className="space-y-6 pt-6">
            <Button
              variant="outline"
              type="button"
              onClick={handleGoogleLogin}
              className="w-full h-14 text-base font-semibold flex items-center justify-center gap-3 border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900 transition-all shadow-sm hover:shadow active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <span>Memproses...</span>
                </div>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="w-6 h-6">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                    <path d="M1 1h22v22H1z" fill="none" />
                  </svg>
                  Masuk dengan Google
                </>
              )}
            </Button>
          </div>

          {/* Demo Info */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl space-y-2 text-center mt-8 border border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2">
              <Lock size={14} className="text-primary" /> Mode Demonstrasi
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Klik tombol di atas untuk masuk ke aplikasi</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
