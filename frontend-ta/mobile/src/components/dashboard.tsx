"use client"


import { useState, useEffect } from "react"
import { Zap, Droplets, Settings } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import StatusBar from "./status-bar"
import AlertBanner from "./alert-banner"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DashboardProps {
  unitId: string
  onUnitChange?: (unit: string) => void
  showTechView?: boolean
  onShowTechView?: (show: boolean) => void
}

export default function Dashboard({ unitId, onUnitChange, showTechView = false, onShowTechView }: DashboardProps) {
  const [kwh, setKwh] = useState(65)
  const [water, setWater] = useState(24)
  const [alerts, setAlerts] = useState<{ id: string; type: "warning" | "error" | "info"; message: string }[]>([
    { id: "1", type: "warning", message: "Saldo KWh Anda rendah. Segera lakukan pengisian ulang." },
  ])

  const [devices, setDevices] = useState([
    {
      id: "meter-kwh-001",
      type: "electricity" as const,
      status: "on" as "on" | "off",
      connectivity: "connected" as const,
      signalStrength: 85,
      lastTelemetry: new Date(Date.now() - 30000).toISOString(),
      batteryLevel: 92,
      tampering: false,
    },
    {
      id: "meter-water-001",
      type: "water" as const,
      status: "on" as "on" | "off",
      connectivity: "connected" as const,
      signalStrength: 78,
      lastTelemetry: new Date(Date.now() - 45000).toISOString(),
      tampering: false,
    },
  ])

  const handleToggle = (type: "electricity" | "water") => {
    setDevices((prev) =>
      prev.map((d) =>
        d.type === type ? { ...d, status: d.status === "on" ? "off" : "on" } : d
      )
    )
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setKwh((prev) => {
        const newVal = Math.max(0, Math.min(100, prev + (Math.random() - 0.5) * 8))
        if (newVal < 20 && !alerts.some((a) => a.id === "critical")) {
          setAlerts((prev) => [
            ...prev,
            {
              id: "critical",
              type: "error" as const,
              message: "⚠️ Saldo KWh KRITIS! Segera isi ulang sebelum layanan terputus.",
            },
          ])
        }
        return newVal
      })
      setWater((prev) => Math.max(0, Math.min(50, prev + (Math.random() - 0.5) * 3)))
    }, 4000)
    return () => clearInterval(interval)
  }, [alerts])

  const kwhPercentage = (kwh / 100) * 100
  const waterPercentage = (water / 50) * 100
  const kwhStatus = kwh <= 0 ? "terputus" : kwh <= 1 ? "kritis" : kwh <= 5 ? "kurang" : "aman"
  const waterStatus = water <= 0 ? "terputus" : water <= 0.1 ? "kritis" : water <= 0.3 ? "kurang" : "aman"

  const getStatusColor = (status: string) => {
    switch (status) {
      case "aman":
        return "text-emerald-600 dark:text-emerald-400"
      case "kritis":
        return "text-amber-600 dark:text-amber-400"
      case "kurang":
        return "text-red-600 dark:text-red-400"
      case "terputus":
        return "text-slate-500"
      default:
        return "text-slate-600"
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case "aman":
        return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100"
      case "kritis":
        return "bg-amber-50 dark:bg-amber-950/30 border-amber-100"
      case "kurang":
        return "bg-red-50 dark:bg-red-950/30 border-red-100"
      case "terputus":
        return "bg-slate-50 dark:bg-slate-800/50 border-slate-200"
      default:
        return "bg-slate-50 border-slate-100"
    }
  }

  const getStatusMessage = (status: string) => {
    switch (status) {
      case "aman":
        return "Normal"
      case "kritis":
        return "Kritis"
      case "kurang":
        return "Hampir Habis"
      case "terputus":
        return "Terputus"
      default:
        return "Unknown"
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="w-full max-w-[200px]">
          <p className="text-slate-500 text-sm mb-1 font-medium">Unit Terpilih</p>
          <Select value={unitId} onValueChange={onUnitChange || (() => { })}>
            <SelectTrigger className="w-full border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm h-10 shadow-sm focus:ring-primary/20 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-slate-50 text-base">
                  Unit <SelectValue placeholder="Pilih Unit" />
                </span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A-2401">A-2401</SelectItem>
              <SelectItem value="B-1205">B-1205</SelectItem>
              <SelectItem value="C-0809">C-0809</SelectItem>
              <SelectItem value="D-1520">D-1520</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onShowTechView?.(!showTechView)}
          className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      <div className="space-y-3">
        {alerts.slice(0, 3).map((alert) => (
          <AlertBanner key={alert.id} type={alert.type} message={alert.message} />
        ))}
      </div>

      {/* Main Status Cards */}
      <div className="grid gap-5">
        {/* KWh Status */}
        <div className={`relative overflow-hidden rounded-3xl border p-6 transition-all duration-300 hover:shadow-lg ${getStatusBg(kwhStatus)}`}>
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl bg-white/80 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm`}>
                <Zap className={`h-6 w-6 ${getStatusColor(kwhStatus)}`} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-50">Listrik</h3>
                <p className={`text-xs font-medium ${getStatusColor(kwhStatus)}`}>
                  Status: {getStatusMessage(kwhStatus)}
                </p>
              </div>
            </div>
            <Switch
              checked={devices.find(d => d.type === 'electricity')?.status === 'on'}
              onCheckedChange={() => handleToggle('electricity')}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>

          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
              {kwh.toFixed(1)}
            </span>
            <span className="text-slate-500 font-medium">KWh</span>
          </div>

          <StatusBar percentage={kwhPercentage} status={kwhStatus} />

          <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50 flex justify-between items-center text-xs text-slate-500">
            <span>Kapasitas: 100 KWh</span>
            <span>Rp 1.800/KWh</span>
          </div>
        </div>

        {/* Water Status */}
        <div className={`relative overflow-hidden rounded-3xl border p-6 transition-all duration-300 hover:shadow-lg ${getStatusBg(waterStatus)}`}>
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl bg-white/80 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm`}>
                <Droplets className={`h-6 w-6 ${getStatusColor(waterStatus)}`} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-50">Air Bersih</h3>
                <p className={`text-xs font-medium ${getStatusColor(waterStatus)}`}>
                  Status: {getStatusMessage(waterStatus)}
                </p>
              </div>
            </div>
            <Switch
              checked={devices.find(d => d.type === 'water')?.status === 'on'}
              onCheckedChange={() => handleToggle('water')}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>

          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
              {water.toFixed(1)}
            </span>
            <span className="text-slate-500 font-medium">M³</span>
          </div>

          <StatusBar percentage={waterPercentage} status={waterStatus} />

          <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50 flex justify-between items-center text-xs text-slate-500">
            <span>Kapasitas: 50 M³</span>
            <span>Rp 4.800/M³</span>
          </div>
        </div>
      </div>
    </div>
  )
}
