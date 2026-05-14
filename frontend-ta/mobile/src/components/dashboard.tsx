"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Zap, Droplets, Wifi, WifiOff, Radio } from "lucide-react"
import mqtt from "mqtt"
import { decode as msgpackDecode } from "@msgpack/msgpack"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
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
import { type BalanceStatus, type TimePeriod, STATUS_MAP } from "@/lib/styles"

interface DashboardProps {
  unitId: string
  availableUnits?: UnitSummary[]
  onSelectUnit?: (id: number) => Promise<void>
}

type LivePoint = {
  date: string
  kwh: number
  water: number
  watts: number
  flowRate: number
  fullDate: string
}

type TrendPoint = {
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
  const [relayOn, setRelayOn]         = useState(true)
  const [valveOpen, setValveOpen]     = useState(true)
  const [loading, setLoading]         = useState(true)

  // ── Control dialog ───────────────────────────────────────────────────────
  const [confirmTarget, setConfirmTarget]   = useState<ControlTarget | null>(null)
  const [confirmNextVal, setConfirmNextVal] = useState(false)
  const [controlPending, setControlPending] = useState(false)

  // ── Konsumsi section ─────────────────────────────────────────────────────
  const [period, setPeriod]             = useState<TimePeriod>("daily")
  const [chartUtility, setChartUtility] = useState<"electricity" | "water">("electricity")
  const [trendData, setTrendData]       = useState<TrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)

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
        setValveOpen(d.summary.valveStatus)
      } catch { /* errors surface in notification bell */ }
      finally { if (active) setLoading(false) }
    }
    void load()
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
      if (mqttRef.current) {
        mqttRef.current.end(false)
        mqttRef.current = null
      }
      setMqttConnected(false)
      setLiveData([])
      return
    }

    const deviceId = `DEV-${unitId}`
    const topic = MQTT_CONFIG.telemetryTopic(deviceId)

    const client = mqtt.connect(MQTT_CONFIG.brokerUrl, {
      username: MQTT_CONFIG.username || undefined,
      password: MQTT_CONFIG.password || undefined,
      clientId: `dash_${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    })
    mqttRef.current = client

    client.on("connect", () => {
      setMqttConnected(true)
      client.subscribe(topic, (err) => {
        if (err) toast.error("Gagal berlangganan data live")
      })
    })

    client.on("offline",  () => { setMqttConnected(false) })

    client.on("error", (err) => {
      setMqttConnected(false)
      toast.error(`MQTT Error: ${err.message}`)
    })

    client.on("message", (t, msg) => {
      if (t !== topic) return
      try {
        let p: Record<string, unknown> | null = null
        const uint8 = new Uint8Array(msg)

        // 1. Try MessagePack
        try {
          const decoded = msgpackDecode(uint8) as Record<string, unknown>
          if (decoded && typeof decoded === 'object') p = decoded
        } catch { /* not msgpack */ }

        // 2. Try 21-byte custom binary frame
        if (!p && uint8.length >= 21) {
          const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength)
          p = {
            et: view.getUint32(0, false) / 100,
            p:  view.getUint16(4, false) / 10,
            v:  view.getUint16(6, false) / 10,
            c:  view.getUint16(8, false) / 1000,
            wf: view.getUint16(10, false) / 100,
            wt: view.getUint32(12, false) / 1000,
            rs: uint8[20] & 1,
            vs: (uint8[20] >> 1) & 1,
          }
        }

        // 3. Try JSON
        if (!p) {
          try { p = JSON.parse(new TextDecoder().decode(uint8)) } catch { /* not json */ }
        }

        if (!p) return

        const now = new Date()
        const watts    = Number(p.p ?? p.active_power_w ?? 0)
        const flowRate = Number(p.wf ?? p.flow_rate_lpm ?? 0)
        const et       = Number(p.et ?? p.total_energy_kwh ?? 0)
        const wt       = Number(p.wt ?? p.total_volume_m3 ?? 0)

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
      } catch { /* malformed frame */ }
    })

    return () => {
      client.end(false)
      setMqttConnected(false)
      mqttRef.current = null
    }
  }, [period, unitId])

  // ── Derived ───────────────────────────────────────────────────────────────
  const kwhPercentage   = useMemo(() => Math.min(100, Math.max(0, kwh)),       [kwh])
  const waterPercentage = useMemo(() => Math.min(100, Math.max(0, water * 2)), [water])
  const kwhStatus:   BalanceStatus = kwh   <= 0 ? "terputus" : kwh   <= 5  ? "kritis" : kwh   <= 20 ? "kurang" : "aman"
  const waterStatus: BalanceStatus = water <= 0 ? "terputus" : water <= 0.5 ? "kritis" : water <= 3  ? "kurang" : "aman"

  const avgDailyKwh = useMemo(() => {
    if (trendData.length === 0) return null
    return trendData.reduce((s, d) => s + d.kwh, 0) / trendData.length
  }, [trendData])

  const avgDailyWater = useMemo(() => {
    if (trendData.length === 0) return null
    return trendData.reduce((s, d) => s + d.water, 0) / trendData.length
  }, [trendData])

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

  const totalChart = displayData.reduce((s, d) => s + ((d as unknown as Record<string, number>)[chartDataKey] ?? 0), 0)
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

      {/* 2-col stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Zap size={18} />}
          label="Listrik"
          value={kwh.toFixed(1)}
          unit="KWh"
          rate={avgDailyKwh !== null ? `~${avgDailyKwh.toFixed(1)} kWh/hari` : undefined}
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
          rate={avgDailyWater !== null ? `~${avgDailyWater.toFixed(2)} m³/hari` : undefined}
          percentage={waterPercentage}
          status={waterStatus}
          controlOn={valveOpen}
          controlPending={controlPending && confirmTarget === "valve"}
          onControlToggle={(next) => requestToggle("valve", next)}
        />
      </div>


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
                title={u === "electricity" ? "Listrik" : "Air"}
                className={`flex items-center justify-center w-8 h-7 rounded-md text-xs font-semibold transition-all ${
                  chartUtility === u ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {u === "electricity" ? <Zap size={13} /> : <Droplets size={13} />}
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
                  ? Math.max(...displayData.map((d) => (d as unknown as Record<string, number>)[chartDataKey] ?? 0)).toFixed(1)
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
function StatCard({ icon, label, value, unit, rate, percentage, status, controlOn, controlPending, onControlToggle }: {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
  rate?: string
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
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${bgColor} ${textColor} ${borderColor}`}>
          {statusLabel}
        </span>
        {rate && (
          <span className="text-[10px] text-muted-foreground font-medium">{rate}</span>
        )}
      </div>
      <StatusBar percentage={percentage} status={status} />
    </div>
  )
}
