"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Zap, Droplets, Wifi, WifiOff, Radio, ChevronLeft, ChevronRight } from "lucide-react"
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
import { subscribeLiveTelemetry } from "@/lib/mockTelemetry"
import { api, type UnitSummary } from "@/lib/api"
import { type BalanceStatus, type TimePeriod, STATUS_MAP } from "@/lib/styles"

interface DashboardProps {
  unitId: string
  availableUnits?: UnitSummary[]
  onSelectUnit?: (id: number) => Promise<void>
}

type RawTrendPoint = {
  bucket: string
  kwh: number
  waterM3: number
}

type LivePoint = {
  date: string
  kwh: number
  water: number
  watts: number
  voltage: number
  current: number
  flowRate: number
  fullDate: string
}

type LiveMetric = "power" | "voltage" | "current"
type PendingActuation = { target: ControlTarget; next: boolean } | null

const LIVE_METRICS: { id: LiveMetric; label: string }[] = [
  { id: "power",   label: "Power"   },
  { id: "voltage", label: "Voltage" },
  { id: "current", label: "Current" },
]

type TrendPoint = {
  date: string
  kwh: number
  water: number
  fullDate: string
}

type ControlTarget = "relay" | "valve"

const PERIODS: { id: TimePeriod; label: string }[] = [
  { id: "daily",   label: "Daily"   },
  { id: "monthly", label: "Monthly" },
  { id: "yearly",  label: "Yearly"  },
  { id: "live",    label: "Live"    },
]

function getDefaultPeriodKey(period: TimePeriod): string {
  const now = new Date();
  if (period === "daily")   return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (period === "monthly") return String(now.getFullYear());
  return '';
}

function offsetKey(key: string, period: TimePeriod, delta: number): string {
  if (period === "daily") {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (period === "monthly") return String(Number(key) + delta);
  return '';
}

function periodKeyLabel(key: string, period: TimePeriod): string {
  if (period === "daily") {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  if (period === "monthly") return `Tahun ${key}`;
  return '';
}

export default function Dashboard({ unitId }: DashboardProps) {
  // ── Summary ──────────────────────────────────────────────────────────────
  const [kwh, setKwh]             = useState(0)
  const [water, setWater]         = useState(0)
  const [relayOn, setRelayOn]         = useState(true)
  const [valveOpen, setValveOpen]     = useState(true)
  const [isDeviceOnline, setIsDeviceOnline] = useState(false)
  const [loading, setLoading]         = useState(true)

  // ── Control dialog ───────────────────────────────────────────────────────
  const [confirmTarget, setConfirmTarget]   = useState<ControlTarget | null>(null)
  const [confirmNextVal, setConfirmNextVal] = useState(false)
  const [controlPending, setControlPending] = useState(false)
  const [pendingActuation, setPendingActuation] = useState<PendingActuation>(null)

  // ── Konsumsi section ─────────────────────────────────────────────────────
  const [period, setPeriod]             = useState<TimePeriod>("daily")
  const [chartUtility, setChartUtility] = useState<"electricity" | "water">("electricity")
  const [liveMeterMetric, setLiveMeterMetric] = useState<LiveMetric>("power")
  const [trendData, setTrendData]       = useState<TrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)
  const [periodKey, setPeriodKey]       = useState(() => getDefaultPeriodKey("daily"))
  const [hasPrev, setHasPrev]           = useState(false)
  const [hasNext, setHasNext]           = useState(false)
  const [rawTrendData, setRawTrendData] = useState<RawTrendPoint[]>([])

  // ── Live telemetry (mock) ────────────────────────────────────────────────
  const [liveData, setLiveData]           = useState<LivePoint[]>([])
  const [liveConnected, setLiveConnected] = useState(false)
  const unsubscribeLiveRef = useRef<(() => void) | null>(null)

  // ── Load summary ─────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    setLoading(true)
    const load = async () => {
      try {
        const d = await api.getDashboard(unitId)
        if (!active) return
        setKwh(d.summary.tokenElectricity)
        setWater(d.summary.tokenWater)
        setRelayOn(!!d.summary.relayStatus)
        setValveOpen(!!d.summary.valveStatus)
        setIsDeviceOnline(d.summary.connectivity?.online ?? false)
      } catch { /* errors surface in notification bell */ }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [unitId])

  useEffect(() => {
    if (!pendingActuation) return
    const current = pendingActuation.target === "relay" ? relayOn : valveOpen
    if (current === pendingActuation.next) {
      toast.success(
        pendingActuation.target === "relay"
          ? pendingActuation.next ? "Power supply confirmed on" : "Power supply confirmed off"
          : pendingActuation.next ? "Water supply confirmed on" : "Water supply confirmed off"
      )
      setPendingActuation(null)
    }
  }, [pendingActuation, relayOn, valveOpen])

  useEffect(() => {
    if (!pendingActuation) return
    const timeoutId = window.setTimeout(() => {
      setPendingActuation((current) => {
        if (!current) return current
        toast.error("Command sent, but the device has not confirmed yet.")
        return null
      })
    }, 15000)
    return () => window.clearTimeout(timeoutId)
  }, [pendingActuation])

  useEffect(() => {
    let active = true
    const interval = window.setInterval(() => {
      void api.getDashboard(unitId)
        .then((d) => {
          if (!active) return
          setKwh(d.summary.tokenElectricity)
          setWater(d.summary.tokenWater)
          setRelayOn(!!d.summary.relayStatus)
          setValveOpen(!!d.summary.valveStatus)
          setIsDeviceOnline(d.summary.connectivity?.online ?? false)
        })
        .catch(() => {
          // Keep the last known balance visible if the poll fails briefly.
        })
    }, 10000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [unitId])

  // Reset periodKey when period changes
  useEffect(() => {
    setPeriodKey(getDefaultPeriodKey(period));
    setHasPrev(false);
    setHasNext(false);
    setRawTrendData([]);
    setTrendData([]);
  }, [period]);

  // Load trend (Daily / Yearly / Monthly)
  useEffect(() => {
    if (period === "live") return
    let active = true
    setTrendLoading(true)
    const load = async () => {
      try {
        const apiPeriod = (period === "monthly" || period === "yearly") ? "monthly" : "daily"
        const rows = await api.getTrends(unitId, apiPeriod)
        if (!active) return
        setRawTrendData(rows || [])
      } catch {
        if (!active) return
        setRawTrendData([])
      } finally {
        if (active) setTrendLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [period, unitId])

  // Filter and map trend data based on periodKey
  useEffect(() => {
    if (period === "live" || rawTrendData.length === 0) return;

    if (period === "yearly") {
      const yearMap = new Map<string, { kwh: number; water: number }>();
      rawTrendData.forEach((r) => {
        const year = String(new Date(r.bucket).getFullYear());
        const e = yearMap.get(year) || { kwh: 0, water: 0 };
        yearMap.set(year, { kwh: e.kwh + r.kwh, water: e.water + r.waterM3 });
      });
      setTrendData([...yearMap.entries()]
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([year, vals]) => ({ date: year, kwh: vals.kwh, water: vals.water, fullDate: `${year}-01-01` }))
      );
      setHasPrev(false); setHasNext(false);
      return;
    }

    let filtered = rawTrendData;
    if (period === "daily") {
      filtered = rawTrendData.filter(t => {
        const d = new Date(t.bucket);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === periodKey;
      });
    } else if (period === "monthly") {
      filtered = rawTrendData.filter(t => String(new Date(t.bucket).getFullYear()) === periodKey);
    }

    setTrendData(filtered.map((r) => ({
      date: period === "monthly"
        ? new Date(r.bucket).toLocaleDateString("en-US", { month: "short" })
        : new Date(r.bucket).toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
      kwh: r.kwh,
      water: r.waterM3,
      fullDate: r.bucket,
    })));

    const allKeys = rawTrendData.map(t => {
      const d = new Date(t.bucket);
      return period === "daily" ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : String(d.getFullYear());
    });
    const unique = [...new Set(allKeys)];
    const prevK = offsetKey(periodKey, period, -1);
    const nextK = offsetKey(periodKey, period, 1);
    setHasPrev(unique.includes(prevK));
    setHasNext(nextK <= getDefaultPeriodKey(period) && unique.includes(nextK));
  }, [rawTrendData, period, periodKey]);

  // ── Live telemetry (mock, replaces MQTT) ─────────────────────────────────
  useEffect(() => {
    if (period !== "live") {
      if (unsubscribeLiveRef.current) {
        unsubscribeLiveRef.current()
        unsubscribeLiveRef.current = null
      }
      setLiveConnected(false)
      setLiveData([])
      return
    }

    const deviceId = `DEV-${unitId}`
    setLiveConnected(true)

    const unsubscribe = subscribeLiveTelemetry(deviceId, (p) => {
      // Sync actuator state from the live stream, same as the real device would.
      setRelayOn(p.relayOn)
      setValveOpen(p.valveOn)

      const now = new Date()
      setLiveData((prev) => {
        const point: LivePoint = {
          date:     now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          kwh:      p.kwh,
          water:    p.water,
          watts:    p.watts,
          voltage:  p.voltage,
          current:  p.current,
          flowRate: p.flowRate,
          fullDate: now.toISOString(),
        }
        const next = [...prev, point]
        return next.length > 60 ? next.slice(-60) : next
      })
    })
    unsubscribeLiveRef.current = unsubscribe

    return () => {
      unsubscribe()
      setLiveConnected(false)
      unsubscribeLiveRef.current = null
    }
  }, [period, unitId])

  // ── Derived ───────────────────────────────────────────────────────────────
  const kwhPercentage   = useMemo(() => Math.min(100, Math.max(0, kwh)),       [kwh])
  const waterPercentage = useMemo(() => Math.min(100, Math.max(0, water * 2)), [water])
  const kwhStatus:   BalanceStatus = kwh   <= 0 ? "offline" : kwh   <= 5  ? "critical" : kwh   <= 20 ? "low" : "good"
  const waterStatus: BalanceStatus = water <= 0 ? "offline" : water <= 0.5 ? "critical" : water <= 3  ? "low" : "good"

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
    ? (chartUtility === "electricity"
        ? (liveMeterMetric === "power" ? "watts" : liveMeterMetric === "voltage" ? "voltage" : "current")
        : "flowRate")
    : (chartUtility === "electricity" ? "kwh" : "water")
  const chartUnit = isLive
    ? (chartUtility === "electricity"
        ? (liveMeterMetric === "power" ? "W" : liveMeterMetric === "voltage" ? "V" : "A")
        : "L/min")
    : (chartUtility === "electricity" ? "kWh" : "m³")

  const latestLive    = liveData[liveData.length - 1]
  const currentWatts  = latestLive?.watts    ?? 0
  const currentFlow   = latestLive?.flowRate ?? 0

  const totalChart = displayData.reduce((s, d) => s + ((d as unknown as Record<string, number>)[chartDataKey] ?? 0), 0)

  // ── Control handlers ─────────────────────────────────────────────────────
  const requestToggle = (target: ControlTarget, next: boolean) => {
    setConfirmTarget(target); setConfirmNextVal(next)
  }

  const confirmToggle = async () => {
    if (!confirmTarget) return
    setControlPending(true)
    try {
      if (confirmTarget === "relay") {
        await api.setRelay(unitId, confirmNextVal)
        setPendingActuation({ target: "relay", next: confirmNextVal })
        toast.success("Power command sent. Waiting for device confirmation.")
      } else {
        await api.setValve(unitId, confirmNextVal)
        setPendingActuation({ target: "valve", next: confirmNextVal })
        toast.success("Water command sent. Waiting for device confirmation.")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change device status")
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
    <div className="p-5 space-y-5 w-full pb-20">
      <div className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
        isDeviceOnline
          ? "bg-primary/8 border-primary/20 text-primary"
          : "bg-status-warn/10 border-status-warn/25 text-status-warn"
      }`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide">Device Status</p>
          <p className="text-sm font-semibold">{isDeviceOnline ? "Online" : "Offline"}</p>
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${isDeviceOnline ? "bg-primary animate-pulse" : "bg-status-warn"}`} />
      </div>

      {/* 2-col stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Zap size={18} />}
          label="Electricity"
          value={kwh.toFixed(2)}
          unit="KWh"
          rate={avgDailyKwh !== null ? `~${avgDailyKwh.toFixed(1)} kWh/day` : undefined}
          percentage={kwhPercentage}
          status={kwhStatus}
          controlOn={relayOn}
          controlPending={(controlPending && confirmTarget === "relay") || pendingActuation?.target === "relay"}
          onControlToggle={(next) => requestToggle("relay", next)}
        />
        <StatCard
          icon={<Droplets size={18} />}
          label="Clean Water"
          value={water.toFixed(3)}
          unit="m³"
          rate={avgDailyWater !== null ? `~${avgDailyWater.toFixed(2)} m³/day` : undefined}
          percentage={waterPercentage}
          status={waterStatus}
          controlOn={valveOpen}
          controlPending={(controlPending && confirmTarget === "valve") || pendingActuation?.target === "valve"}
          onControlToggle={(next) => requestToggle("valve", next)}
        />
      </div>


      {/* Konsumsi card */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base text-foreground">Consumption</h2>
          {/* Utility toggle */}
          <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
            {(["electricity", "water"] as const).map((u) => (
              <button
                key={u}
                onClick={() => setChartUtility(u)}
                title={u === "electricity" ? "Electricity" : "Water"}
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
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {PERIODS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setPeriod(id)}
              className={`flex-1 min-w-[70px] flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === id
                  ? id === "live"
                    ? "bg-status-critical text-white shadow-sm"
                    : "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {id === "live" && <Radio size={10} className={period === "live" && liveConnected ? "animate-pulse" : ""} />}
              {label}
            </button>
          ))}
        </div>

        {/* Period switcher for daily/monthly */}
        {(period === "daily" || period === "monthly") && (
          <div className="flex items-center justify-between px-1">
            <button
              onClick={() => setPeriodKey(k => offsetKey(k, period, -1))}
              disabled={!hasPrev}
              className="p-1 rounded-full hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {periodKeyLabel(periodKey, period)}
            </span>
            <button
              onClick={() => setPeriodKey(k => offsetKey(k, period, 1))}
              disabled={!hasNext}
              className="p-1 rounded-full hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Live metric sub-selector (electricity only) */}
        {isLive && chartUtility === "electricity" && (
          <div className="flex gap-0.5 p-1 bg-muted rounded-xl">
            {LIVE_METRICS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setLiveMeterMetric(id)}
                className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-95 ${
                  liveMeterMetric === id
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground active:bg-muted-foreground/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Live current value chip */}
        {isLive && (
          <div className="bg-muted/40 rounded-xl p-3">
            {chartUtility === "electricity" ? (
              <>
                <p className="text-xs text-muted-foreground mb-0.5">
                  {liveMeterMetric === "power" ? "Current Power" : liveMeterMetric === "voltage" ? "Current Voltage" : "Current Amperage"}
                </p>
                <p className="text-xl font-bold text-foreground leading-none">
                  {liveMeterMetric === "power"
                    ? currentWatts.toFixed(0)
                    : liveMeterMetric === "voltage"
                      ? (latestLive?.voltage ?? 0).toFixed(1)
                      : (latestLive?.current ?? 0).toFixed(3)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">{chartUnit}</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-0.5">Water Flow Rate</p>
                <p className="text-xl font-bold text-foreground leading-none">
                  {currentFlow.toFixed(1)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">L/min</span>
                </p>
              </>
            )}
          </div>
        )}

        {/* Live connection status (shown only if the mock stream hasn't started yet) */}
        {isLive && !liveConnected && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
            <WifiOff size={14} />
            Connecting to device...
          </div>
        )}

        {/* Chart */}
        {(trendLoading && !isLive) ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : displayData.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            {isLive
              ? <><Wifi size={24} className="opacity-40" /><p className="text-sm">Waiting for data from device...</p></>
              : <p className="text-sm">No data yet for this period</p>
            }
          </div>
        ) : (
          <ConsumptionChart
            data={displayData}
            period={isLive ? "daily" : period === "monthly" ? "monthly" : period === "yearly" ? "yearly" : "daily"}
            dataKey={chartDataKey}
            unit={chartUnit}
            color={chartUtility === "electricity" ? "var(--primary)" : "var(--chart-2)"}
            isLive={isLive}
          />
        )}

        {/* Stats row */}
        {displayData.length > 0 && (
          <div className="pt-1 border-t border-border">
            <p className="text-xs text-muted-foreground">{isLive ? "Peak" : "Total"}</p>
            <p className="font-bold text-foreground">
              {isLive
                ? Math.max(...displayData.map((d) => (d as unknown as Record<string, number>)[chartDataKey] ?? 0)).toFixed(
                    liveMeterMetric === "current" ? 3 : liveMeterMetric === "voltage" ? 1 : chartUtility === "water" ? 2 : 0
                  )
                : totalChart.toFixed(2)
              }{" "}
              <span className="text-xs font-normal text-muted-foreground">{chartUnit}</span>
            </p>
          </div>
        )}
      </div>

      {/* Confirmation AlertDialog */}
      <AlertDialog open={confirmTarget !== null} onOpenChange={(open) => { if (!open) setConfirmTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmNextVal
                ? `Turn on ${confirmTarget === "relay" ? "power supply" : "water supply"}?`
                : `Turn off ${confirmTarget === "relay" ? "power supply" : "water supply"}?`
              }
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget === "relay"
                ? confirmNextVal
                  ? "The relay will be turned on. Make sure the device is ready to receive power."
                  : "The relay will be turned off. Power to the unit will be cut."
                : confirmNextVal
                  ? "The water valve will be opened. Water flow will resume."
                  : "The water valve will be closed. Water flow to the unit will stop."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={controlPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmToggle()}
              disabled={controlPending}
              className={!confirmNextVal ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}
            >
              {controlPending ? "Processing..." : "Yes, Continue"}
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
      {controlPending && (
        <p className="text-[10px] font-semibold text-amber-600">Waiting for device confirmation</p>
      )}
      <div className="space-y-1.5">
        <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${bgColor} ${textColor} ${borderColor}`}>
          {statusLabel}
        </span>
        {rate && (
          <p className="text-[10px] text-muted-foreground font-medium">{rate}</p>
        )}
      </div>
      <StatusBar percentage={percentage} status={status} />
    </div>
  )
}
