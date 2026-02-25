"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Lock, Home } from "lucide-react"

interface LoginFormProps {
  onLogin: (payload: { unitNo: string; pin: string }) => Promise<void>
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [unitNo, setUnitNo] = useState("A-2401")
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")

  const handleLogin = async () => {
    setIsLoading(true)
    setError("")

    try {
      await onLogin({ unitNo: unitNo.trim().toUpperCase(), pin: pin.trim() })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login gagal"
      setError(message)
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

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nomor Unit</label>
              <Input value={unitNo} onChange={(e) => setUnitNo(e.target.value)} placeholder="A-2401" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">PIN</label>
              <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Masukkan PIN" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              variant="outline"
              type="button"
              onClick={handleLogin}
              className="w-full h-14 text-base font-semibold"
              disabled={isLoading || !unitNo || !pin}
            >
              {isLoading ? "Memproses..." : "Masuk"}
            </Button>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl space-y-2 text-center mt-4 border border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2">
              <Lock size={14} className="text-primary" /> Akses Aman JWT
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Gunakan PIN unit untuk autentikasi API.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
