"use client"

import { useState } from "react"
import { BarChart3, Zap, Droplets, WifiOff, Wifi } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ConsumptionChart from "./consumption-chart"
import DetailedTable from "./detailed-table"
import TransactionHistory from "./transaction-history"
import TokenConversionInfo from "./token-conversion-info"
import mqtt from "mqtt"
import { useEffect } from "react"
import { MQTT_CONFIG } from "@/lib/config"

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
  const [metricMode, setMetricMode] = useState<"rate" | "usage">("rate") // 'rate' = W / L/min, 'usage' = KWh / M³
  const [activeTab, setActiveTab] = useState("consumption")
  const [isConnected, setIsConnected] = useState(false)
  const [realtimeData, setRealtimeData] = useState<ChartData[]>([])


  const mockTransactions = [
    {
      id: "TRX-20250103-001",
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      amount: 100000,
      type: "purchase" as const,
      status: "success" as const,
      method: "QRIS",
      unitsAdded: 45,
      unitType: "kwh" as const,
    },
    {
      id: "TRX-20250102-001",
      timestamp: new Date(Date.now() - 172800000).toISOString(),
      amount: 30705,
      type: "consumption" as const,
      status: "success" as const,
      unitsAdded: -12.5,
      unitType: "kwh" as const,
    },
    {
      id: "TRX-20250101-001",
      timestamp: new Date(Date.now() - 259200000).toISOString(),
      amount: 22500,
      type: "consumption" as const,
      status: "success" as const,
      unitsAdded: -9.2,
      unitType: "kwh" as const,
    },
  ]

  // Generate mock data based on time period

  // MQTT Connection Logic
  useEffect(() => {
    // Only connect for daily view to show realtime updates
    if (timePeriod !== "daily") return

    console.log("Connecting to MQTT Broker...", MQTT_CONFIG.brokerUrl)
    const client = mqtt.connect(MQTT_CONFIG.brokerUrl, {
      username: MQTT_CONFIG.username,
      password: MQTT_CONFIG.password,
      clientId: 'Web_Client_' + Math.random().toString(16).substr(2, 8)
    })

    client.on('connect', () => {
      console.log("[MQTT] Connected to HiveMQ!")
      setIsConnected(true)
      client.subscribe(MQTT_CONFIG.topics.TELEMETRY, (err) => {
        if (err) console.error("[MQTT] Subscription error:", err)
        else console.log("[MQTT] Subscribed to topic:", MQTT_CONFIG.topics.TELEMETRY)
      })
    })

    client.on('message', (topic, message) => {
      if (topic === MQTT_CONFIG.topics.TELEMETRY) {
        try {
          const rawMessage = message.toString()
          console.log("[MQTT] INCOMING PAYLOAD:", rawMessage)

          const payload = JSON.parse(rawMessage)
          const now = new Date()
          const timeString = now.toLocaleTimeString()

          setRealtimeData(prev => {
            // New Payload Structure:
            const watts = payload.electricity?.active_power_w || 0
            const flowRate = payload.water?.flow_rate_lpm || 0

            // Accumulated values from payload or fallback to mock increment
            const totalKwh = payload.electricity?.total_energy_kwh || 0
            const totalWater = payload.water?.total_volume_m3 || 0

            // If payload has total, use it. Else accumulate manually (fallback)
            const kwh = totalKwh > 0 ? totalKwh : (prev.length > 0 ? prev[prev.length - 1].kwh + (watts / 1000 / 3600) * 2 : 0)
            const water = totalWater > 0 ? totalWater : (prev.length > 0 ? prev[prev.length - 1].water + (flowRate / 1000 / 60) * 2 : 0)

            const newDataPoint: ChartData = {
              date: timeString,
              kwh: Number(kwh.toFixed(4)),
              water: Number(water.toFixed(4)),
              watts: Number(watts),
              flowRate: Number(flowRate.toFixed(2)),
              fullDate: now.toISOString()
            }

            console.log("[MQTT] Updating Chart Data:", newDataPoint)

            // Keep last 15 points
            const updated = [...prev, newDataPoint]
            if (updated.length > 15) updated.shift()
            return updated
          })
        } catch (err) {
          console.error("[MQTT] Failed to parse message:", err)
        }
      }
    })

    client.on('error', (err) => {
      console.error("MQTT Error:", err)
      setIsConnected(false)
    })

    client.on('offline', () => {
      setIsConnected(false)
    })

    return () => {
      if (client.connected) {
        client.end()
      }
    }
  }, [timePeriod])


  // Use realtime data if daily and we have data, otherwise use mock data (or empty if requested)
  // User requested: "if there isn't then there should be no error but an empty graph" for the MQTT part
  // So for "daily", we default to realtimeData.

  // However, initially realtimeData is empty. We should show empty graph until data arrives.
  // Note: generateData is still useful for weekly/monthly history which isn't realtime.

  const displayData = timePeriod === "daily" ? realtimeData : generateData(timePeriod)

  const totalKwh = displayData.reduce((sum, d) => sum + d.kwh, 0)
  const totalWater = displayData.reduce((sum, d) => sum + d.water, 0)
  const avgKwh = displayData.length > 0 ? (totalKwh / displayData.length).toFixed(2) : "0"
  const avgWater = displayData.length > 0 ? (totalWater / displayData.length).toFixed(2) : "0"
  const avgWatts = displayData.length > 0 ? (displayData.reduce((sum, d) => sum + (d.watts || 0), 0) / displayData.length).toFixed(0) : "0"
  const avgFlow = displayData.length > 0 ? (displayData.reduce((sum, d) => sum + (d.flowRate || 0), 0) / displayData.length).toFixed(1) : "0"


  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Riwayat Konsumsi</h1>
          {timePeriod === "daily" && (
            <div className={`flex items-center gap-2 text-sm px-3 py-1 rounded-full ${isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span>{isConnected ? 'Live' : 'Disconnected'}</span>
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

        {/* Consumption Tab */}
        <TabsContent value="consumption" className="space-y-4">
          {/* Time Period Selector */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
              {["daily", "weekly", "monthly"].map((period) => (
                <button
                  key={period}
                  onClick={() => setTimePeriod(period as TimePeriod)}
                  className={`px-3 py-1.5 rounded-md font-medium text-sm transition-all ${timePeriod === period
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {period === "daily" ? "Harian" : period === "weekly" ? "Mingguan" : "Bulanan"}
                </button>
              ))}
            </div>

            {/* Metric Mode Toggle */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
              <button
                onClick={() => setMetricMode("rate")}
                className={`px-3 py-1.5 rounded-md font-medium text-sm transition-all ${metricMode === "rate"
                  ? "bg-white dark:bg-slate-700 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Rate (W / L/min)
              </button>
              <button
                onClick={() => setMetricMode("usage")}
                className={`px-3 py-1.5 rounded-md font-medium text-sm transition-all ${metricMode === "usage"
                  ? "bg-white dark:bg-slate-700 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Usage (KWh / M³)
              </button>
            </div>
          </div>

          {/* Utility Type Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedUtility("kwh")}
              className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition-all ${selectedUtility === "kwh"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
                }`}
            >
              <Zap size={18} className="inline mr-2" />
              Listrik (KWh)
            </button>
            <button
              onClick={() => setSelectedUtility("water")}
              className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition-all ${selectedUtility === "water"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
                }`}
            >
              <Droplets size={18} className="inline mr-2" />
              Air (M³)
            </button>
          </div>

          {/* Chart */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={20} className="text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Grafik Konsumsi</h2>
            </div>
            <ConsumptionChart
              data={displayData}
              period={timePeriod}
              dataKey={
                selectedUtility === 'kwh'
                  ? (metricMode === 'rate' ? 'watts' : 'kwh')
                  : (metricMode === 'rate' ? 'flowRate' : 'water')
              }
              unit={
                selectedUtility === 'kwh'
                  ? (metricMode === 'rate' ? 'Watt' : 'KWh')
                  : (metricMode === 'rate' ? 'L/min' : 'M³')
              }
              color={selectedUtility === 'kwh' ? 'var(--primary)' : '#3b82f6'}
            />
          </Card>

          {/* Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-medium">
                  {metricMode === 'rate'
                    ? (selectedUtility === 'kwh' ? "Rata-rata Daya" : "Rata-rata Debit")
                    : (selectedUtility === 'kwh' ? "Total Energi" : "Total Volume")}
                </span>
                <Zap size={18} className="text-primary" />
              </div>
              <p className="text-3xl font-bold text-foreground">
                {metricMode === 'rate'
                  ? (selectedUtility === 'kwh' ? avgWatts : avgFlow)
                  : (selectedUtility === 'kwh' ? Number(totalKwh).toFixed(2) : Number(totalWater).toFixed(2))
                }
              </p>
              <p className="text-xs text-muted-foreground">
                {metricMode === 'rate'
                  ? (selectedUtility === 'kwh' ? "Watt (Avg)" : "L/min (Avg)")
                  : (selectedUtility === 'kwh' ? "KWh (Periode Ini)" : "M³ (Periode Ini)")
                }
              </p>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-medium">
                  {metricMode === 'rate'
                    ? (selectedUtility === 'kwh' ? "Beban Puncak" : "Debit Maksimum")
                    : (selectedUtility === 'kwh' ? "Rata-rata per Hari" : "Rata-rata per Hari")
                  }
                </span>
                <BarChart3 size={18} className="text-secondary" />
              </div>
              <p className="text-3xl font-bold text-foreground">
                {metricMode === 'rate'
                  ? (selectedUtility === 'kwh'
                    ? Math.max(...displayData.map(d => d.watts || 0), 0).toFixed(0)
                    : Math.max(...displayData.map(d => d.flowRate || 0), 0).toFixed(1))
                  : (selectedUtility === 'kwh' ? avgKwh : avgWater)
                }
              </p>
              <p className="text-xs text-muted-foreground">
                {metricMode === 'rate'
                  ? (selectedUtility === 'kwh' ? "Watt (Max)" : "L/min (Max)")
                  : `Estimasi Rp ${(selectedUtility === "kwh"
                    ? Number.parseFloat(avgKwh) * 1800
                    : Number.parseFloat(avgWater) * 4800).toLocaleString("id-ID")}`
                }
              </p>
            </Card>
          </div>

          {/* Detailed Table */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Detail {selectedUtility === "kwh" ? "Listrik" : "Air"}
            </h2>
            <DetailedTable data={displayData} utility={selectedUtility} />
          </Card>

          {/* Verification Info */}
          <Card className="p-4 bg-muted/50 space-y-3">
            <p className="text-sm font-semibold text-foreground">Verifikasi Konsumsi</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Data konsumsi ditampilkan berdasarkan laporan dari sistem monitoring terdistribusi (TSDB). Anda dapat
              menggunakan data ini untuk memverifikasi tagihan bulanan Anda.
            </p>
            <button className="text-sm font-medium text-primary hover:underline">Download Laporan →</button>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card className="p-4 bg-primary/5 border-primary/20">
            <p className="text-sm font-semibold text-foreground mb-2">Pelacakan Transaksi Lengkap</p>
            <p className="text-xs text-muted-foreground">
              Semua transaksi pembelian token dan konsumsi tercatat dalam sistem untuk transparansi dan auditabilitas
              penuh.
            </p>
          </Card>
          <TransactionHistory transactions={mockTransactions} />
        </TabsContent>

        <TabsContent value="rates" className="space-y-4">
          <TokenConversionInfo kwhRate={1800} waterRate={4800} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function generateData(period: "daily" | "weekly" | "monthly") {
  const data = []
  const now = new Date()

  if (period === "daily") {
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      data.push({
        date: date.toLocaleDateString("id-ID", { month: "short", day: "numeric" }),
        kwh: Math.floor(Math.random() * 15) + 5,
        water: Math.floor(Math.random() * 5) + 1,
        watts: Math.floor(Math.random() * 500) + 200,
        flowRate: Math.floor(Math.random() * 15) + 5,
        fullDate: date.toISOString().split("T")[0],
      })
    }
  } else if (period === "weekly") {
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i * 7)
      data.push({
        date: `W${Math.floor((now.getDate() - i * 7) / 7)}`,
        kwh: Math.floor(Math.random() * 80) + 30,
        water: Math.floor(Math.random() * 25) + 10,
        watts: Math.floor(Math.random() * 500) + 200,
        flowRate: Math.floor(Math.random() * 15) + 5,
        fullDate: date.toISOString().split("T")[0],
      })
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now)
      date.setMonth(date.getMonth() - i)
      data.push({
        date: date.toLocaleDateString("id-ID", { month: "short" }),
        kwh: Math.floor(Math.random() * 300) + 150,
        water: Math.floor(Math.random() * 100) + 50,
        watts: Math.floor(Math.random() * 500) + 200,
        flowRate: Math.floor(Math.random() * 15) + 5,
        fullDate: date.toISOString().split("T")[0],
      })
    }
  }

  return data
}
