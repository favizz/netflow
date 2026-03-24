"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"
import type { UnitSummary } from "@/lib/api"

interface UnitSelectorProps {
  units: UnitSummary[]
  onSelect: (unitId: number) => Promise<void>
}

export default function UnitSelector({ units, onSelect }: UnitSelectorProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSelect = async (unitId: number) => {
    setIsLoading(true)
    setError("")
    try {
      await onSelect(unitId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memilih unit")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-0 ring-1 ring-slate-200 dark:ring-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-xl">
        <div className="p-8 md:p-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center mb-4">
              <div className="bg-primary text-primary-foreground p-4 rounded-2xl shadow-md">
                <Home size={36} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Pilih Unit</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Akun Anda memiliki lebih dari satu unit. Pilih unit yang ingin diakses.</p>
          </div>

          <div className="flex flex-col gap-3">
            {units.map((unit) => (
              <Button
                key={unit.id}
                variant="outline"
                className="h-14 text-base font-semibold"
                disabled={isLoading}
                onClick={() => void handleSelect(unit.id)}
              >
                {unit.unitNo}
              </Button>
            ))}
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>
      </Card>
    </div>
  )
}
