"use client"

import { useEffect, useMemo, useState } from "react"
import { BarChart3, Zap, Droplets, WifiOff, Wifi } from "lucide-react"
import { toast } from "sonner"
import mqtt from "mqtt"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ConsumptionChart from "./consumption-chart"
import DetailedTable from "./detailed-table"
import TransactionHistory, { type HistoryTransaction } from "./transaction-history"
import TokenConversionInfo from "./token-conversion-info"
import { MQTT_CONFIG } from "@/lib/config"
import { api } from "@/lib/api"
import { interactive, DEFAULT_TARIFF, type TimePeriod } from "@/lib/styles"

type ChartData = {
  date: string
  kwh: number
  water: number
  watts?: number
  flowRate?: number
  voltage?: number
  current?: number
  fullDate: string
}

type LiveMetric = "power" | "voltage" | "current"

interface ConsumptionHistoryProps {
  unitId: string
}

const LIVE_METRICS: { id: LiveMetric; label: string }[] = [
  { id: "power",   label: "Daya"     },
  { id: "voltage", label: "Tegangan" },
  { id: "current", label: "Arus"     },
]

const PERIODS: { id: TimePeriod; label: string }[] = [
  { id: "daily",   label: "Harian"  },
  { id: "monthly", label: "Bulanan" },
  { id: "yearly",  label: "Tahunan" },
]

export default function ConsumptionHistory({ unitId }: ConsumptionHistoryProps) {
  const [timePeriod, setTimePeriod]           = useState<TimePeriod>("daily")
  const [selectedUtility, setSelectedUtility] = useState<"kwh" | "water">("kwh")
  const [liveMetric, setLiveMetric]           = useState<LiveMetric>("power")
  const [activeTab, setActiveTab]             = useState("consumption")
  const [isConnected, setIsConnected]         = useState(false)
  const [mqttErrorMsg, setMqttErrorMsg]       = useState<string | null>(null)
  const [mqttKey, setMqttKey]                 = useState(0)
  const [realtimeData, setRealtimeData]       = useState<ChartData[]>([])
  const [apiTrendData, setApiTrendData]       = useState<ChartData[]>([])
  const [transactions, setTransactions]       = useState<HistoryTransaction[]>([])
  const [tariff, setTariff]                   = useState<{ kwh: number; water: number }>(DEFAULT_TARIFF)

  useEffect(() => {
    let active = true

    const loadTransactions = async () => {
      try {
        const list = await api.getTransactions(unitId)
        if (!active) return
        setTransactions(
          list.map((tx) => ({
            id: tx.id,
            createdAt: tx.createdAt,
            amount: tx.amount,
            status: tx.status,
            method: tx.method,
            type: "purchase",
          })),
        )
      } catch {
        if (!active) return
        setTransactions([])
      }
    }

    const loadTariff = async () => {
      try {
        const dash = await api.getDashboard(unitId)
        if (!active) return
        setTariff({ kwh: dash.summary.energyTariff, water: DEFAULT_TARIFF.water })
      } catch {
        // keep default tariff on failure
      }
    }

    void loadTransactions()
    void loadTariff()

    return () => { active = false }
  }, [unitId])

  useEffect(() => {
    if (timePeriod === "daily") return

    let active = true

    const loadTrend = async () => {
      try {
        const apiPeriod = timePeriod === "yearly" ? "monthly" : "daily"
        const rows = await api.getTrends(unitId, apiPeriod)
        if (!active) return

        let mapped: ChartData[]
        if (timePeriod === "yearly") {
          const yearMap = new Map<string, { kwh: number; water: number }>()
          rows.forEach((r) => {
            const year = String(new Date(r.bucket).getFullYear())
            const e = yearMap.get(year) ?? { kwh: 0, water: 0 }
            yearMap.set(year, { kwh: e.kwh + r.kwh, water: e.water + r.waterM3 })
          })
          mapped = [...yearMap.entries()]
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([year, vals]) => ({
              date:     year,
              kwh:      vals.kwh,
              water:    vals.water,
              fullDate: `${year}-01-01`,
            }))
        } else {
          mapped = rows.map((r) => ({
            date:     r.bucket,
            kwh:      r.kwh,
            water:    r.waterM3,
            fullDate: r.bucket,
          }))
        }

        setApiTrendData(mapped)
      } catch {
        if (!active) return
        toast.error("Gagal memuat data tren")
        setApiTrendData([])
      }
    }

    void loadTrend()

    return () => { active = false }
  }, [timePeriod, unitId])

  useEffect(() => {
    if (timePeriod !== "daily") return

    const topic  = MQTT_CONFIG.telemetryTopic(unitId)
    const client = mqtt.connect(MQTT_CONFIG.brokerUrl, {
      username:        MQTT_CONFIG.username || undefined,
      password:        MQTT_CONFIG.password || undefined,
      clientId:        `mobile_${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 0,
    })

    client.on("connect", () => {
      setIsConnected(true)
      setMqttErrorMsg(null)
      client.subscribe(topic)
    })

    client.on("message", (incomingTopic, message) => {
      if (incomingTopic !== topic) return

      try {
        let payload: Record<string, unknown> | null = null
        const uint8 = new Uint8Array(message)

        if (uint8.length >= 21) {
          const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength)
          payload = {
            et: view.getUint32(0, false) / 100,
            p:  view.getUint16(4, false) / 10,
            v:  view.getUint16(6, false) / 10,
            c:  view.getUint16(8, false) / 1000,
            wf: view.getUint16(10, false) / 100,
            wt: view.getUint32(12, false) / 1000,
            rs: uint8[20] & 1,
            vs: (uint8[20] >> 1) & 1,
          }
        } else {
          try { payload = JSON.parse(message.toString()) } catch { /* ignore */ }
        }

        if (!payload) return
        const now = new Date()

        setRealtimeData((prev) => {
          const watts      = Number(payload?.p  ?? (payload?.electricity as Record<string, unknown>)?.active_power_w  ?? 0)
          const voltage    = Number(payload?.v  ?? 0)
          const current    = Number(payload?.c  ?? 0)
          const flowRate   = Number(payload?.wf ?? (payload?.water as Record<string, unknown>)?.flow_rate_lpm        ?? 0)
          const totalKwh   = Number(payload?.et ?? (payload?.electricity as Record<string, unknown>)?.total_energy_kwh ?? 0)
          const totalWater = Number(payload?.wt ?? (payload?.water as Record<string, unknown>)?.total_volume_m3        ?? 0)

          const last  = prev.length > 0 ? prev[prev.length - 1] : null
          const kwh   = totalKwh   > 0 ? totalKwh   : (last?.kwh   ?? 0) + (watts    / 1000 / 60) * 2
          const water = totalWater > 0 ? totalWater : (last?.water ?? 0) + (flowRate / 1000)       * 2

          const point: ChartData = {
            date:     now.toLocaleTimeString("id-ID"),
            kwh:      Number(kwh.toFixed(4)),
            water:    Number(water.toFixed(4)),
            watts,
            voltage:  Number(voltage.toFixed(1)),
            current:  Number(current.toFixed(3)),
            flowRate: Number(flowRate.toFixed(2)),
            fullDate: now.toISOString(),
          }

          const next = [...prev, point]
          if (next.length > 30) next.shift()
          return next
        })
      } catch {
        setIsConnected(false)
      }
    })

    client.on("offline", () => setIsConnected(false))

    client.on("error", (err) => {
      setIsConnected(false)
      const raw = (err as Error)?.message ?? String(err)
      if (
        raw.includes("Bad username") ||
        raw.includes("Not authorized") ||
        raw.includes("Connection refused")
      ) {
        setMqttErrorMsg(
          "Data langsung tidak dapat ditampilkan karena akses ditolak oleh sistem. Hubungi pengelola gedung untuk membantu.",
        )
      } else {
        setMqttErrorMsg(
          "Koneksi data langsung terputus. Periksa sambungan internet Anda, lalu coba lagi.",
        )
      }
    })

    return () => {
      client.end(true)
      setIsConnected(false)
    }
  }, [timePeriod, unitId, mqttKey])

  const displayData = useMemo(() => {
    if (timePeriod === "daily") return realtimeData
    return apiTrendData
  }, [timePeriod, realtimeData, apiTrendData])

  // Clear live error state when leaving the daily view
  useEffect(() => {
    if (timePeriod !== "daily") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMqttErrorMsg(null)
      setIsConnected(false)
    }
  }, [timePeriod])

  const handleMqttRetry = () => {
    setMqttErrorMsg(null)
    setRealtimeData([])
    setMqttKey((k) => k + 1)
  }

  // Derive chart config from the combination of period + utility + live metric
  const chartConfig = useMemo(() => {
    if (timePeriod === "daily") {
      if (selectedUtility === "kwh") {
        if (liveMetric === "power")   return { dataKey: "watts",    unit: "W",     color: "var(--primary)" }
        if (liveMetric === "voltage") return { dataKey: "voltage",  unit: "V",     color: "var(--chart-3)" }
        return                               { dataKey: "current",  unit: "A",     color: "var(--chart-4)" }
      }
      return { dataKey: "flowRate", unit: "L/min", color: "var(--chart-2)" }
    }
    if (selectedUtility === "kwh") return { dataKey: "kwh",   unit: "kWh", color: "var(--primary)"  }
    return                                { dataKey: "water", unit: "m³",  color: "var(--chart-2)" }
  }, [timePeriod, selectedUtility, liveMetric])

  // Peak of whichever metric is currently charted
  const peakValue = useMemo(() => {
    const key = chartConfig.dataKey as keyof ChartData
    return Math.max(...displayData.map((d) => Number(d[key] ?? 0)), 0)
  }, [displayData, chartConfig])

  // Total consumption is only meaningful for period (monthly/yearly) views
  const totalConsumption = useMemo(() => {
    if (timePeriod === "daily") return null
    if (selectedUtility === "kwh") return displayData.reduce((sum, d) => sum + d.kwh,   0)
    return                                displayData.reduce((sum, d) => sum + d.water, 0)
  }, [timePeriod, selectedUtility, displayData])

  const peakLabel = useMemo(() => {
    if (timePeriod !== "daily") return "Puncak"
    if (selectedUtility === "water") return "Debit Puncak"
    if (liveMetric === "power")   return "Daya Puncak"
    if (liveMetric === "voltage") return "Tegangan Maks"
    return "Arus Maks"
  }, [timePeriod, selectedUtility, liveMetric])

  const peakPrecision = useMemo(() => {
    if (timePeriod !== "daily") return 2
    if (selectedUtility === "water") return 2
    if (liveMetric === "power")   return 0
    if (liveMetric === "voltage") return 1
    return 3
  }, [timePeriod, selectedUtility, liveMetric])

  const handleInvoiceDownload = async (transactionId: string) => {
    try {
      const content = await api.downloadInvoice(unitId, transactionId)
      const blob    = new Blob([content], { type: "text/plain;charset=utf-8" })
      const url     = URL.createObjectURL(blob)
      const link    = document.createElement("a")
      link.href     = url
      link.download = `invoice-${transactionId}.txt`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengunduh invoice")
    }
  }

  const isLive = timePeriod === "daily"

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Riwayat Konsumsi</h1>
        {isLive && (
          <div
            className={`flex items-center gap-2 text-sm px-3 py-1 rounded-full ${
              isConnected
                ? "bg-status-good/10 text-status-good"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>{isConnected ? "Live" : "Disconnected"}</span>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Unit {unitId}</p>

      <Tabs defaultValue="consumption" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="consumption">Konsumsi</TabsTrigger>
          <TabsTrigger value="transactions">Transaksi</TabsTrigger>
          <TabsTrigger value="rates">Tarif</TabsTrigger>
        </TabsList>

        <TabsContent value="consumption" className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-primary" />
              <h2 className="text-base font-semibold text-foreground">Grafik Konsumsi</h2>
            </div>

            {/* ── Utility selector ─────────────────────────────────── */}
            <div className={interactive.segRoot}>
              <button
                onClick={() => setSelectedUtility("kwh")}
                className={`${interactive.segItem} ${selectedUtility === "kwh" ? interactive.segActive : interactive.segInactive}`}
              >
                <Zap size={15} />
                Listrik
              </button>
              <button
                onClick={() => setSelectedUtility("water")}
                className={`${interactive.segItem} ${selectedUtility === "water" ? interactive.segActive : interactive.segInactive}`}
              >
                <Droplets size={15} />
                Air
              </button>
            </div>

            {/* ── Period selector ───────────────────────────────────── */}
            <div className={interactive.segRoot}>
              {PERIODS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTimePeriod(id)}
                  className={`${interactive.segItem} ${timePeriod === id ? interactive.segActive : interactive.segInactive}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Live metric selector (daily + electricity only) ───── */}
            {isLive && selectedUtility === "kwh" && (
              <div className={interactive.segRoot}>
                {LIVE_METRICS.map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setLiveMetric(id)}
                    className={`${interactive.segItem} ${liveMetric === id ? interactive.segActive : interactive.segInactive}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {isLive && mqttErrorMsg ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <WifiOff size={32} className="text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                  {mqttErrorMsg}
                </p>
                <button
                  onClick={handleMqttRetry}
                  className="text-sm font-semibold text-primary active:text-primary/60 transition-colors"
                >
                  Coba Lagi
                </button>
              </div>
            ) : (
              <ConsumptionChart
                data={displayData}
                period={timePeriod as "daily" | "yearly" | "monthly"}
                dataKey={chartConfig.dataKey}
                unit={chartConfig.unit}
                color={chartConfig.color}
                isLive={isLive}
              />
            )}
          </Card>

          {/* ── Stats ──────────────────────────────────────────────── */}
          <div className={`grid gap-4 ${totalConsumption !== null ? "grid-cols-2" : "grid-cols-1 max-w-xs"}`}>
            {totalConsumption !== null && (
              <Card className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-medium">
                    {selectedUtility === "kwh" ? "Total Energi" : "Total Volume"}
                  </span>
                  <BarChart3 size={16} className="text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {totalConsumption.toFixed(2)}
                  <span className="text-base font-normal text-muted-foreground ml-1">
                    {selectedUtility === "kwh" ? "kWh" : "m³"}
                  </span>
                </p>
              </Card>
            )}

            <Card className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-medium">{peakLabel}</span>
                {selectedUtility === "kwh" ? (
                  <Zap size={16} className="text-primary" />
                ) : (
                  <Droplets size={16} className="text-chart-2" />
                )}
              </div>
              <p className="text-3xl font-bold text-foreground">
                {peakValue.toFixed(peakPrecision)}
                <span className="text-base font-normal text-muted-foreground ml-1">
                  {chartConfig.unit}
                </span>
              </p>
            </Card>
          </div>

          {/* ── Detailed table ─────────────────────────────────────── */}
          <Card className="p-4">
            <h2 className="text-base font-semibold text-foreground mb-4">
              Detail {selectedUtility === "kwh" ? "Listrik" : "Air"}
            </h2>
            <DetailedTable
              data={displayData}
              utility={selectedUtility}
              isLive={isLive}
            />
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card className="p-4 bg-primary/5 border-primary/20">
            <p className="text-sm font-semibold text-foreground mb-1">Pelacakan Transaksi Lengkap</p>
            <p className="text-xs text-muted-foreground">
              Transaksi berasal dari API payment gateway dan dapat diunduh sebagai invoice.
            </p>
          </Card>
          <TransactionHistory transactions={transactions} onDownloadInvoice={handleInvoiceDownload} />
        </TabsContent>

        <TabsContent value="rates" className="space-y-4">
          <TokenConversionInfo kwhRate={tariff.kwh} waterRate={tariff.water} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
