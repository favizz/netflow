"use client"

import { useEffect, useMemo, useState } from "react"
import { BarChart3, Zap, Droplets, WifiOff, Wifi } from "lucide-react"
import mqtt from "mqtt"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ConsumptionChart from "./consumption-chart"
import DetailedTable from "./detailed-table"
import TransactionHistory, { type HistoryTransaction } from "./transaction-history"
import TokenConversionInfo from "./token-conversion-info"
import { MQTT_CONFIG } from "@/lib/config"
import { api } from "@/lib/api"

interface ChartData {
  date: string
  kwh: number
  water: number
  watts?: number
  flowRate?: number
  fullDate: string
}

interface ConsumptionHistoryProps {
  unitId: string
}

type TimePeriod = "daily" | "weekly" | "monthly"

export default function ConsumptionHistory({ unitId }: ConsumptionHistoryProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("daily")
  const [selectedUtility, setSelectedUtility] = useState<"kwh" | "water">("kwh")
  const [metricMode, setMetricMode] = useState<"rate" | "usage">("rate")
  const [activeTab, setActiveTab] = useState("consumption")
  const [isConnected, setIsConnected] = useState(false)
  const [realtimeData, setRealtimeData] = useState<ChartData[]>([])
  const [apiTrendData, setApiTrendData] = useState<ChartData[]>([])
  const [transactions, setTransactions] = useState<HistoryTransaction[]>([])

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

    void loadTransactions()

    return () => {
      active = false
    }
  }, [unitId])

  useEffect(() => {
    if (timePeriod === "daily") return

    let active = true

    const loadTrend = async () => {
      try {
        const period = timePeriod === "monthly" ? "monthly" : "daily"
        const rows = await api.getTrends(unitId, period)
        if (!active) return

        const mapped: ChartData[] = rows.map((r) => ({
          date: r.bucket,
          kwh: r.kwh,
          water: r.waterM3,
          watts: r.avgPowerW,
          flowRate: r.avgFlowLpm,
          fullDate: r.bucket,
        }))

        if (timePeriod === "weekly") {
          setApiTrendData(mapped.slice(-7))
        } else {
          setApiTrendData(mapped)
        }
      } catch {
        if (!active) return
        setApiTrendData([])
      }
    }

    void loadTrend()

    return () => {
      active = false
    }
  }, [timePeriod, unitId])

  useEffect(() => {
    if (timePeriod !== "daily") return

    const topic = MQTT_CONFIG.telemetryTopic(unitId)
    const client = mqtt.connect(MQTT_CONFIG.brokerUrl, {
      username: MQTT_CONFIG.username || undefined,
      password: MQTT_CONFIG.password || undefined,
      clientId: `mobile_${Math.random().toString(16).slice(2, 10)}`,
    })

    client.on("connect", () => {
      setIsConnected(true)
      client.subscribe(topic)
    })

    client.on("message", (incomingTopic, message) => {
      if (incomingTopic !== topic) return

      try {
        const payload = JSON.parse(message.toString())
        const now = new Date()

        setRealtimeData((prev) => {
          const watts = Number(payload?.electricity?.active_power_w || payload?.p || 0)
          const flowRate = Number(payload?.water?.flow_rate_lpm || payload?.wf || 0)
          const totalKwh = Number(payload?.electricity?.total_energy_kwh || payload?.et || 0)
          const totalWater = Number(payload?.water?.total_volume_m3 || 0)

          const last = prev.length > 0 ? prev[prev.length - 1] : null
          const kwh = totalKwh > 0 ? totalKwh : (last?.kwh || 0) + (watts / 1000 / 60) * 2
          const water = totalWater > 0 ? totalWater : (last?.water || 0) + (flowRate / 1000) * 2

          const point: ChartData = {
            date: now.toLocaleTimeString("id-ID"),
            kwh: Number(kwh.toFixed(4)),
            water: Number(water.toFixed(4)),
            watts,
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
    client.on("error", () => setIsConnected(false))

    return () => {
      client.end(true)
      setIsConnected(false)
    }
  }, [timePeriod, unitId])

  const displayData = useMemo(() => {
    if (timePeriod === "daily") return realtimeData
    return apiTrendData
  }, [timePeriod, realtimeData, apiTrendData])

  const totalKwh = displayData.reduce((sum, d) => sum + d.kwh, 0)
  const totalWater = displayData.reduce((sum, d) => sum + d.water, 0)
  const avgKwh = displayData.length > 0 ? (totalKwh / displayData.length).toFixed(2) : "0"
  const avgWater = displayData.length > 0 ? (totalWater / displayData.length).toFixed(2) : "0"
  const avgWatts =
    displayData.length > 0
      ? (displayData.reduce((sum, d) => sum + (d.watts || 0), 0) / displayData.length).toFixed(0)
      : "0"
  const avgFlow =
    displayData.length > 0
      ? (displayData.reduce((sum, d) => sum + (d.flowRate || 0), 0) / displayData.length).toFixed(1)
      : "0"

  const handleInvoiceDownload = async (transactionId: string) => {
    try {
      const content = await api.downloadInvoice(unitId, transactionId)
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `invoice-${transactionId}.txt`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to download invoice", error)
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Riwayat Konsumsi</h1>
          {timePeriod === "daily" && (
            <div
              className={`flex items-center gap-2 text-sm px-3 py-1 rounded-full ${
                isConnected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}
            >
              {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span>{isConnected ? "Live" : "Disconnected"}</span>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Unit {unitId}</p>
      </div>

      <Tabs defaultValue="consumption" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="consumption">Konsumsi</TabsTrigger>
          <TabsTrigger value="transactions">Transaksi</TabsTrigger>
          <TabsTrigger value="rates">Tarif</TabsTrigger>
        </TabsList>

        <TabsContent value="consumption" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
              {["daily", "weekly", "monthly"].map((period) => (
                <button
                  key={period}
                  onClick={() => setTimePeriod(period as TimePeriod)}
                  className={`px-3 py-1.5 rounded-md font-medium text-sm transition-all ${
                    timePeriod === period
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {period === "daily" ? "Harian" : period === "weekly" ? "Mingguan" : "Bulanan"}
                </button>
              ))}
            </div>

            <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
              <button
                onClick={() => setMetricMode("rate")}
                className={`px-3 py-1.5 rounded-md font-medium text-sm transition-all ${
                  metricMode === "rate"
                    ? "bg-white dark:bg-slate-700 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Rate (W / L/min)
              </button>
              <button
                onClick={() => setMetricMode("usage")}
                className={`px-3 py-1.5 rounded-md font-medium text-sm transition-all ${
                  metricMode === "usage"
                    ? "bg-white dark:bg-slate-700 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Usage (KWh / m3)
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setSelectedUtility("kwh")}
              className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition-all ${
                selectedUtility === "kwh"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <Zap size={18} className="inline mr-2" />
              Listrik (KWh)
            </button>
            <button
              onClick={() => setSelectedUtility("water")}
              className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition-all ${
                selectedUtility === "water"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <Droplets size={18} className="inline mr-2" />
              Air (m3)
            </button>
          </div>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={20} className="text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Grafik Konsumsi</h2>
            </div>
            <ConsumptionChart
              data={displayData}
              period={timePeriod}
              dataKey={
                selectedUtility === "kwh"
                  ? metricMode === "rate"
                    ? "watts"
                    : "kwh"
                  : metricMode === "rate"
                    ? "flowRate"
                    : "water"
              }
              unit={
                selectedUtility === "kwh"
                  ? metricMode === "rate"
                    ? "Watt"
                    : "KWh"
                  : metricMode === "rate"
                    ? "L/min"
                    : "m3"
              }
              color={selectedUtility === "kwh" ? "var(--primary)" : "#3b82f6"}
            />
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-medium">
                  {metricMode === "rate"
                    ? selectedUtility === "kwh"
                      ? "Rata-rata Daya"
                      : "Rata-rata Debit"
                    : selectedUtility === "kwh"
                      ? "Total Energi"
                      : "Total Volume"}
                </span>
                <Zap size={18} className="text-primary" />
              </div>
              <p className="text-3xl font-bold text-foreground">
                {metricMode === "rate"
                  ? selectedUtility === "kwh"
                    ? avgWatts
                    : avgFlow
                  : selectedUtility === "kwh"
                    ? Number(totalKwh).toFixed(2)
                    : Number(totalWater).toFixed(2)}
              </p>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-medium">
                  {metricMode === "rate" ? "Beban Puncak" : "Rata-rata"}
                </span>
                <BarChart3 size={18} className="text-secondary" />
              </div>
              <p className="text-3xl font-bold text-foreground">
                {metricMode === "rate"
                  ? selectedUtility === "kwh"
                    ? Math.max(...displayData.map((d) => d.watts || 0), 0).toFixed(0)
                    : Math.max(...displayData.map((d) => d.flowRate || 0), 0).toFixed(1)
                  : selectedUtility === "kwh"
                    ? avgKwh
                    : avgWater}
              </p>
            </Card>
          </div>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Detail {selectedUtility === "kwh" ? "Listrik" : "Air"}
            </h2>
            <DetailedTable data={displayData} utility={selectedUtility} />
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card className="p-4 bg-primary/5 border-primary/20">
            <p className="text-sm font-semibold text-foreground mb-2">Pelacakan Transaksi Lengkap</p>
            <p className="text-xs text-muted-foreground">
              Transaksi berasal dari API payment gateway dan dapat diunduh sebagai invoice.
            </p>
          </Card>
          <TransactionHistory transactions={transactions} onDownloadInvoice={handleInvoiceDownload} />
        </TabsContent>

        <TabsContent value="rates" className="space-y-4">
          <TokenConversionInfo kwhRate={1800} waterRate={4800} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
