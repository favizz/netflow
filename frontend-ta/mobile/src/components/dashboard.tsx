"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Zap, Droplets, Wifi, WifiOff, Radio, CalendarDays, TrendingDown } from "lucide-react"
import mqtt from "mqtt"
import { decode as msgpackDecode } from "@msgpack/msgpack"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import StatusBar from "./status-bar"
import ConsumptionChart from "./consumption-chart"
import { MQTT_CONFIG } from "@/lib/config"
import { api, type UnitSummary } from "@/lib/api"
import { STATUS_MAP, type BalanceStatus, type TimePeriod } from "@/lib/styles"

interface DashboardProps {
  unitId: string
  availableUnits?: UnitSummary[]
  onSelectUnit?: (id: number) => Promise<void>
}

interface LivePoint {
  date: string
  kwh: number
  water: number
  watts: number
  flowRate: number
  fullDate: string
}

interface TrendPoint {
  date: string
  kwh: number
  water: number
  fullDate: string
}

type ControlTarget = "relay" | "valve"

const PERIODS: { id: TimePeriod; label: string }[] = [
  { id: "daily",   label: "Harian"   },
  { id: "weekly",  label: "Mingguan" },
  { id: "monthly", label: "Bulanan"  },
  { id: "live",    label: "Live"     },
]

export default function Dashboard({ unitId, availableUnits, onSelectUnit }: DashboardProps) {
  // ── Summary ──────────────────────────────────────────────────────────────
  const [kwh, setKwh]             = useState(0)
  const [water, setWater]         = useState(0)
  const [relayOn, setRelayOn]     = useState(true)
  const [valveOpen, setValveOpen] = useState(true)
  const [loading, setLoading]     = useState(true)

  // ── Control dialog ───────────────────────────────────────────────────────
  const [confirmTarget, setConfirmTarget]   = useState<ControlTarget | null>(null)
  const [confirmNextVal, setConfirmNextVal] = useState(false)
  const [controlPending, setControlPending] = useState(false)

  // ── Konsumsi section ─────────────────────────────────────────────────────
  const [period, setPeriod]             = useState<TimePeriod>("daily")
  const [chartUtility, setChartUtility] = useState<"electricity" | "water">("electricity")
  const [trendData, setTrendData]       = useState<TrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)

  // ── ML Forecast ──────────────────────────────────────────────────────────
  const [forecast, setForecast] = useState<{
    estimatedDaysRemaining: number;
    avgDailyKwh: number;
    dailyCostRp: number;
    confidence: 'high' | 'medium' | 'low';
  } | null>(null)

  // ── MQTT live ────────────────────────────────────────────────────────────
  const [liveData, setLiveData]           = useState<LivePoint[]>([])
  const [mqttConnected, setMqttConnected] = useState(false)
  const mqttRef = useRef<ReturnType<typeof mqtt.connect> | null>(null)

  // ── Load summary ─────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    setLoading(true)
    const load = async () => {
      try {
        const d = await api.getDashboard(unitId)
        if (!active) return
        setKwh(d.summary.remainingEstimate.kwh)
        setWater(Math.max(0, d.summary.remainingEstimate.kwh / 2.5))
        setRelayOn(d.summary.relayStatus)
      } catch { /* errors surface in notification bell */ }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [unitId])

  // ── Load ML forecast (once on mount / unit change) ───────────────────────
  useEffect(() => {
    let active = true
    api.getForecast(unitId)
      .then((f) => { if (active) setForecast(f) })
      .catch(() => { /* ML service may be down — forecast stays hidden */ })
    return () => { active = false }
  }, [unitId])

  // ── Load trend (Harian / Mingguan / Bulanan) ──────────────────────────────
  useEffect(() => {
    if (period === "live") return
    let active = true
    setTrendLoading(true)
    const load = async () => {
      try {
        const apiPeriod = period === "monthly" ? "monthly" : "daily"
        const rows = await api.getTrends(unitId, apiPeriod)
        if (!active) return
        const mapped: TrendPoint[] = rows.map((r) => ({
          date: period === "daily" || period === "weekly"
            ? new Date(r.bucket).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
            : new Date(r.bucket).toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
          kwh:      r.kwh,
          water:    r.waterM3,
          fullDate: r.bucket,
        }))
        setTrendData(period === "weekly" ? mapped.slice(-7) : mapped)
      } catch {
        if (!active) return
        setTrendData([])
      } finally {
        if (active) setTrendLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [period, unitId])

  // ── MQTT (Live only) ─────────────────────────────────────────────────────
  useEffect(() => {
    if (period !== "live") {
      mqttRef.current?.end(true)
      mqttRef.current = null
      setMqttConnected(false)
      setLiveData([])
      return
    }

    const topic = MQTT_CONFIG.telemetryTopic(unitId)
    const client = mqtt.connect(MQTT_CONFIG.brokerUrl, {
      username: MQTT_CONFIG.username || undefined,
      password: MQTT_CONFIG.password || undefined,
      clientId: `dash_${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 5000,
    })
    mqttRef.current = client

    client.on("connect", () => { setMqttConnected(true); client.subscribe(topic) })
    client.on("offline",  () => setMqttConnected(false))
    client.on("error",    () => setMqttConnected(false))
    client.on("reconnect",() => setMqttConnected(false))

    client.on("message", (_t, msg) => {
      try {
        // Prefer MessagePack binary; fall back to JSON string
        let p: Record<string, any>;
        try {
          p = msgpackDecode(msg) as Record<string, any>;
        } catch {
          p = JSON.parse(msg.toString());
        }
        const now = new Date()
        const watts    = Number(p?.p ?? 0)
        const flowRate = Number(p?.wf ?? 0)
        const et       = Number(p?.et ?? 0)
        const wt       = Number(p?.wt ?? 0)

        setLiveData((prev) => {
          const last = prev[prev.length - 1]
          const point: LivePoint = {
            date:     now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            kwh:      et > 0 ? et : (last?.kwh ?? 0) + watts / 1_000 / 720,
            water:    wt > 0 ? wt : (last?.water ?? 0) + flowRate / 1_000,
            watts,
            flowRate,
            fullDate: now.toISOString(),
          }
          const next = [...prev, point]
          return next.length > 60 ? next.slice(-60) : next
        })
      } catch { /* malformed */ }
    })

    return () => { client.end(true); setMqttConnected(false) }
  }, [period, unitId])

  // ── Derived ───────────────────────────────────────────────────────────────
  const kwhPercentage   = useMemo(() => Math.min(100, Math.max(0, kwh)),       [kwh])
  const waterPercentage = useMemo(() => Math.min(100, Math.max(0, water * 2)), [water])
  const kwhStatus:   BalanceStatus = kwh   <= 0 ? "terputus" : kwh   <= 5  ? "kritis" : kwh   <= 20 ? "kurang" : "aman"
  const waterStatus: BalanceStatus = water <= 0 ? "terputus" : water <= 0.5 ? "kritis" : water <= 3  ? "kurang" : "aman"

  const isLive      = period === "live"
  const displayData = isLive ? liveData : trendData

  const chartDataKey = isLive
    ? (chartUtility === "electricity" ? "watts"    : "flowRate")
    : (chartUtility === "electricity" ? "kwh"      : "water")
  const chartUnit = isLive
    ? (chartUtility === "electricity" ? "W"        : "L/min")
    : (chartUtility === "electricity" ? "KWh"      : "m³")

  const latestLive    = liveData[liveData.length - 1]
  const currentWatts  = latestLive?.watts    ?? 0
  const currentFlow   = latestLive?.flowRate ?? 0

  const totalChart = displayData.reduce((s, d) => s + ((d as any)[chartDataKey] ?? 0), 0)
  const avgChart   = displayData.length > 0 ? totalChart / displayData.length : 0

  // ── Control handlers ─────────────────────────────────────────────────────
  const requestToggle = (target: ControlTarget, next: boolean) => {
    setConfirmTarget(target); setConfirmNextVal(next)
  }

  const confirmToggle = async () => {
    if (!confirmTarget) return
    setControlPending(true)
    try {
      if (confirmTarget === "relay") {
        const res = await api.setRelay(unitId, confirmNextVal)
        setRelayOn(res.relayStatus)
        toast.success(res.relayStatus ? "Aliran listrik dinyalakan" : "Aliran listrik dimatikan")
      } else {
        const res = await api.setValve(unitId, confirmNextVal)
        setValveOpen(res.valveStatus)
        toast.success(res.valveStatus ? "Aliran air dibuka" : "Aliran air ditutup")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah status perangkat")
    } finally {
      setControlPending(false); setConfirmTarget(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="p-5 space-y-5 w-full">

      {/* Unit selector */}
      {availableUnits && availableUnits.length > 1 && (
        <Select
          value={unitId}
          onValueChange={(val) => {
            const unit = availableUnits.find((u) => u.unitNo === val)
            if (unit && onSelectUnit) void onSelectUnit(unit.id)
          }}
        >
          <SelectTrigger className="w-40 h-9 rounded-xl border-border bg-card text-sm font-semibold shadow-sm">
            <SelectValue placeholder="Pilih Unit" />
          </SelectTrigger>
          <SelectContent>
            {availableUnits.map((u) => (
              <SelectItem key={u.id} value={u.unitNo}>Unit {u.unitNo}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* 2-col stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Zap size={18} />}
          label="Listrik"
          value={kwh.toFixed(1)}
          unit="KWh"
          percentage={kwhPercentage}
          status={kwhStatus}
          controlOn={relayOn}
          controlPending={controlPending && confirmTarget === "relay"}
          onControlToggle={(next) => requestToggle("relay", next)}
        />
        <StatCard
          icon={<Droplets size={18} />}
          label="Air Bersih"
          value={water.toFixed(1)}
          unit="m³"
          percentage={waterPercentage}
          status={waterStatus}
          controlOn={valveOpen}
          controlPending={controlPending && confirmTarget === "valve"}
          onControlToggle={(next) => requestToggle("valve", next)}
        />
      </div>

      {/* ML Forecast card */}
      {forecast && (
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
          <div className={`p-2.5 rounded-xl ${forecast.estimatedDaysRemaining <= 3 ? "bg-status-critical/10" : "bg-primary/10"}`}>
            {forecast.estimatedDaysRemaining <= 3
              ? <TrendingDown size={20} className="text-status-critical" />
              : <CalendarDays size={20} className="text-primary" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Estimasi Saldo Habis</p>
            <p className={`text-xl font-bold leading-tight ${forecast.estimatedDaysRemaining <= 3 ? "text-status-critical" : "text-foreground"}`}>
              {forecast.estimatedDaysRemaining <= 0
                ? "Habis"
                : `${forecast.estimatedDaysRemaining.toFixed(1)} hari`
              }
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rp {forecast.dailyCostRp.toLocaleString("id-ID", { maximumFractionDigits: 0 })}/hari · {forecast.avgDailyKwh.toFixed(2)} kWh rata-rata
            </p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
            forecast.confidence === 'high'   ? "bg-primary/15 text-primary" :
            forecast.confidence === 'medium' ? "bg-status-warn/15 text-status-warn" :
                                               "bg-muted text-muted-foreground"
          }`}>
            {forecast.confidence === 'high' ? "Tinggi" : forecast.confidence === 'medium' ? "Sedang" : "Rendah"}
          </span>
        </div>
      )}

      {/* Konsumsi card */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base text-foreground">Konsumsi</h2>
          {/* Utility toggle */}
          <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
            {(["electricity", "water"] as const).map((u) => (
              <button
                key={u}
                onClick={() => setChartUtility(u)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  chartUtility === u ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {u === "electricity" ? <Zap size={11} /> : <Droplets size={11} />}
                {u === "electricity" ? "Listrik" : "Air"}
              </button>
            ))}
          </div>
        </div>

        {/* Period tabs */}
        <div className="flex gap-1">
          {PERIODS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setPeriod(id)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === id
                  ? id === "live"
                    ? "bg-status-critical text-white shadow-sm"
                    : "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {id === "live" && <Radio size={10} className={period === "live" && mqttConnected ? "animate-pulse" : ""} />}
              {label}
            </button>
          ))}
        </div>

        {/* Live current metrics */}
        {isLive && (
          <div className="bg-muted/40 rounded-xl p-3">
            {chartUtility === "electricity" ? (
              <>
                <p className="text-xs text-muted-foreground mb-0.5">Daya Saat Ini</p>
                <p className="text-xl font-bold text-foreground leading-none">
                  {currentWatts.toFixed(0)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">W</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-0.5">Debit Air</p>
                <p className="text-xl font-bold text-foreground leading-none">
                  {currentFlow.toFixed(1)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">L/min</span>
                </p>
              </>
            )}
          </div>
        )}

        {/* MQTT connection status (live only, when disconnected) */}
        {isLive && !mqttConnected && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
            <WifiOff size={14} />
            Menghubungkan ke broker MQTT...
          </div>
        )}

        {/* Chart */}
        {(trendLoading && !isLive) ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : displayData.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            {isLive
              ? <><Wifi size={24} className="opacity-40" /><p className="text-sm">Menunggu data dari perangkat...</p></>
              : <p className="text-sm">Belum ada data untuk periode ini</p>
            }
          </div>
        ) : (
          <ConsumptionChart
            data={displayData}
            period={isLive ? "daily" : period === "monthly" ? "monthly" : "monthly"}
            dataKey={chartDataKey}
            unit={chartUnit}
            color={chartUtility === "electricity" ? "var(--primary)" : "var(--chart-2)"}
          />
        )}

        {/* Stats row */}
        {displayData.length > 0 && (
          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground">{isLive ? "Maks" : "Total"}</p>
              <p className="font-bold text-foreground">
                {isLive
                  ? Math.max(...displayData.map((d) => (d as any)[chartDataKey] ?? 0)).toFixed(1)
                  : totalChart.toFixed(2)
                }{" "}
                <span className="text-xs font-normal text-muted-foreground">{chartUnit}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rata-rata</p>
              <p className="font-bold text-foreground">
                {avgChart.toFixed(2)}{" "}
                <span className="text-xs font-normal text-muted-foreground">{chartUnit}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation AlertDialog */}
      <AlertDialog open={confirmTarget !== null} onOpenChange={(open) => { if (!open) setConfirmTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmNextVal
                ? `Nyalakan ${confirmTarget === "relay" ? "aliran listrik" : "aliran air"}?`
                : `Matikan ${confirmTarget === "relay" ? "aliran listrik" : "aliran air"}?`
              }
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget === "relay"
                ? confirmNextVal
                  ? "Relay akan dinyalakan. Pastikan perangkat siap menerima aliran listrik."
                  : "Relay akan dimatikan. Aliran listrik ke unit akan terputus."
                : confirmNextVal
                  ? "Katup air akan dibuka. Aliran air akan kembali aktif."
                  : "Katup air akan ditutup. Aliran air ke unit akan terputus."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={controlPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmToggle()}
              disabled={controlPending}
              className={!confirmNextVal ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}
            >
              {controlPending ? "Memproses..." : "Ya, Lanjutkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}

// ── Compact stat card ─────────────────────────────────────────────────────────
function StatCard({ icon, label, value, unit, percentage, status, controlOn, controlPending, onControlToggle }: {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
  percentage: number
  status: BalanceStatus
  controlOn: boolean
  controlPending: boolean
  onControlToggle: (next: boolean) => void
}) {
  const { label: statusLabel, textColor, bgColor, borderColor } = STATUS_MAP[status]

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${bgColor} ${borderColor}`}>
      <div className="flex items-center justify-between">
        <div className={`p-2 rounded-xl bg-card/80 shadow-sm ${textColor}`}>{icon}</div>
        <Switch
          checked={controlOn}
          disabled={controlPending}
          onCheckedChange={onControlToggle}
          className="data-[state=checked]:bg-primary scale-90"
        />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tracking-tight leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{unit} · {label}</p>
      </div>
      <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${bgColor} ${textColor} ${borderColor}`}>
        {statusLabel}
      </span>
      <StatusBar percentage={percentage} status={status} />
    </div>
  )
}
