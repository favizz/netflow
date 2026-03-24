"use client"

import { useState } from "react"
import { GoogleLogin } from "@react-oauth/google"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"

const isDev = !import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string).startsWith('replace-')

const DEV_EMAIL = '18222070@std.stei.itb.ac.id'

interface LoginFormProps {
  onGoogleLogin: (credential: string) => Promise<void>
  onDevLogin: (email: string) => Promise<void>
}

export default function LoginForm({ onGoogleLogin, onDevLogin }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const withLoading = async (fn: () => Promise<void>) => {
    setIsLoading(true)
    setError("")
    try {
      await fn()
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Login gagal"
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
              <div className="bg-primary text-primary-foreground p-4 rounded-2xl shadow-md rotate-3 hover:rotate-0 transition-transform duration-300">
                <Home size={40} />
              </div>
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">Penghuni</h1>
            <p className="text-base text-slate-500 dark:text-slate-400">Manajemen Utilitas Apartemen Anda</p>
          </div>

          <div className="flex flex-col items-center gap-4 pt-2">
            {isLoading ? (
              <p className="text-sm text-slate-500">Memproses...</p>
            ) : isDev ? (
              <Button
                variant="outline"
                className="h-14 w-full max-w-xs text-base font-semibold border-dashed border-amber-400 text-amber-700 hover:bg-amber-50"
                onClick={() => void withLoading(() => onDevLogin(DEV_EMAIL))}
              >
                [Dev] Masuk sebagai {DEV_EMAIL}
              </Button>
            ) : (
              <GoogleLogin
                onSuccess={(response) => {
                  if (response.credential) {
                    void withLoading(() => onGoogleLogin(response.credential!))
                  }
                }}
                onError={() => setError("Login dengan Google gagal. Coba lagi.")}
                theme="outline"
                size="large"
                width="320"
                text="signin_with"
                locale="id"
              />
            )}

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
          </div>

          <p className="text-xs text-center text-slate-400 dark:text-slate-500">
            {isDev
              ? "Mode pengembangan — bypass Google OAuth aktif"
              : "Hanya akun yang terdaftar oleh administrator yang dapat masuk."}
          </p>
        </div>
      </Card>
    </div>
  )
}
