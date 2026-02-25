"use client"

import { useEffect, useMemo, useState } from "react"
import { Zap, Droplets, Settings, Wifi, WifiOff } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import StatusBar from "./status-bar"
import AlertBanner from "./alert-banner"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, type NotificationItem } from "@/lib/api"

interface DashboardProps {
  unitId: string
  onUnitChange?: (unit: string) => void
  showTechView?: boolean
  onShowTechView?: (show: boolean) => void
}

export default function Dashboard({ unitId, onUnitChange, showTechView = false, onShowTechView }: DashboardProps) {
  const [kwh, setKwh] = useState(0)
  const [water, setWater] = useState(0)
  const [relayStatus, setRelayStatus] = useState(true)
  const [alerts, setAlerts] = useState<NotificationItem[]>([])
  const [towerConnectivity, setTowerConnectivity] = useState<{
    tower: string
    totalUnits: number
    onlineUnits: number
    offlineUnits: number
  } | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const [dashboard, connectivity] = await Promise.all([
          api.getDashboard(unitId),
          api.getTowerConnectivity(unitId.split("-")[0]),
        ])

        if (!active) return

        setKwh(dashboard.summary.remainingEstimate.kwh)
        setWater(Math.max(0, dashboard.summary.remainingEstimate.kwh / 2.5))
        setRelayStatus(dashboard.summary.relayStatus)
        setAlerts(dashboard.notifications)
        setTowerConnectivity({
          tower: unitId.split("-")[0],
          totalUnits: connectivity.totalUnits,
          onlineUnits: connectivity.onlineUnits,
          offlineUnits: connectivity.offlineUnits,
        })
      } catch {
        if (!active) return
        setAlerts([
          {
            type: "error",
            message: "Gagal mengambil data dashboard dari server.",
            timestamp: new Date().toISOString(),
          },
        ])
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [unitId])

  const kwhPercentage = useMemo(() => Math.max(0, Math.min(100, kwh)), [kwh])
  const waterPercentage = useMemo(() => Math.max(0, Math.min(100, water * 2)), [water])

  const kwhStatus = kwh <= 0 ? "terputus" : kwh <= 5 ? "kritis" : kwh <= 20 ? "kurang" : "aman"
  const waterStatus = water <= 0 ? "terputus" : water <= 0.5 ? "kritis" : water <= 3 ? "kurang" : "aman"

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
      <div className="flex items-center justify-between">
        <div className="w-full max-w-[200px]">
          <p className="text-slate-500 text-sm mb-1 font-medium">Unit Terpilih</p>
          <Select value={unitId} onValueChange={onUnitChange || (() => {})}>
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
        {alerts.slice(0, 3).map((alert, idx) => (
          <AlertBanner key={`${alert.timestamp}-${idx}`} type={alert.type} message={alert.message} />
        ))}
      </div>

      {towerConnectivity && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Konektivitas Tower {towerConnectivity.tower}</p>
              <p className="text-xs text-muted-foreground">
                {towerConnectivity.onlineUnits}/{towerConnectivity.totalUnits} unit online
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {towerConnectivity.offlineUnits === 0 ? <Wifi size={16} className="text-emerald-600" /> : <WifiOff size={16} className="text-red-600" />}
              <span className={towerConnectivity.offlineUnits === 0 ? "text-emerald-600" : "text-red-600"}>
                {towerConnectivity.offlineUnits === 0 ? "Stabil" : `${towerConnectivity.offlineUnits} offline`}
              </span>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-5">
        <div className={`relative overflow-hidden rounded-3xl border p-6 transition-all duration-300 hover:shadow-lg ${getStatusBg(kwhStatus)}`}>
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm">
                <Zap className={`h-6 w-6 ${getStatusColor(kwhStatus)}`} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-50">Listrik</h3>
                <p className={`text-xs font-medium ${getStatusColor(kwhStatus)}`}>Status: {getStatusMessage(kwhStatus)}</p>
              </div>
            </div>
            <Switch checked={relayStatus} disabled className="data-[state=checked]:bg-emerald-500" />
          </div>

          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">{kwh.toFixed(1)}</span>
            <span className="text-slate-500 font-medium">KWh</span>
          </div>

          <StatusBar percentage={kwhPercentage} status={kwhStatus} />

          <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50 flex justify-between items-center text-xs text-slate-500">
            <span>Perkiraan sisa token</span>
            <span>Data API Gateway</span>
          </div>
        </div>

        <div className={`relative overflow-hidden rounded-3xl border p-6 transition-all duration-300 hover:shadow-lg ${getStatusBg(waterStatus)}`}>
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm">
                <Droplets className={`h-6 w-6 ${getStatusColor(waterStatus)}`} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-50">Air Bersih</h3>
                <p className={`text-xs font-medium ${getStatusColor(waterStatus)}`}>Status: {getStatusMessage(waterStatus)}</p>
              </div>
            </div>
            <Switch checked={relayStatus} disabled className="data-[state=checked]:bg-emerald-500" />
          </div>

          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">{water.toFixed(1)}</span>
            <span className="text-slate-500 font-medium">m3</span>
          </div>

          <StatusBar percentage={waterPercentage} status={waterStatus} />

          <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50 flex justify-between items-center text-xs text-slate-500">
            <span>Estimasi berbasis sisa energi</span>
            <span>Monitoring gangguan aktif</span>
          </div>
        </div>
      </div>
    </div>
  )
}
