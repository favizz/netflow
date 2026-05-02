"use client"
import { useState } from "react"

import { Card } from "@/components/ui/card"
import { AlertTriangle, CheckCircle2, Clock, Zap, Droplets, AlertCircle } from "lucide-react"
import type { DeviceStatus } from "@/hooks/use-app-state"

interface SystemHealthDashboardProps {
  devices: DeviceStatus[]
  lastUpdated: string
}

export default function SystemHealthDashboard({ devices, lastUpdated }: SystemHealthDashboardProps) {
  const [now] = useState(() => Date.now())
  const connectedDevices = devices.filter((d) => d.connectivity === "connected").length
  const allDevicesHealthy = devices.every((d) => d.connectivity === "connected" && !d.tampering)
  const anyTampering = devices.some((d) => d.tampering)

  const electricityMeter = devices.find((d) => d.type === "electricity")
  const waterMeter = devices.find((d) => d.type === "water")

  return (
    <div className="space-y-4">
      {/* System Health Summary */}
      <Card className="p-4 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Status Sistem</p>
            <div className="flex items-center gap-2">
              {allDevicesHealthy ? (
                <>
                  <CheckCircle2 size={18} className="text-primary" />
                  <span className="text-sm font-medium text-primary">Semua Perangkat Normal</span>
                </>
              ) : (
                <>
                  <AlertCircle size={18} className="text-destructive" />
                  <span className="text-sm font-medium text-destructive">Deteksi Anomali</span>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">Perangkat Terhubung</p>
            <p className="text-2xl font-bold text-primary">
              {connectedDevices}/{devices.length}
            </p>
          </div>
        </div>
      </Card>

      {/* Device Status Cards */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">Status Meter</p>

        {electricityMeter && (
          <Card className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap size={18} className="text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Meter Listrik</p>
                  <p className="text-xs text-muted-foreground">ID: {electricityMeter.id}</p>
                </div>
              </div>
              {electricityMeter.tampering && <AlertTriangle size={16} className="text-destructive" />}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Status Koneksi</span>
                <p
                  className={`font-semibold ${electricityMeter.connectivity === "connected" ? "text-primary" : "text-destructive"}`}
                >
                  {electricityMeter.connectivity === "connected" ? "Terhubung" : "Terputus"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Sinyal</span>
                <p className="font-semibold text-foreground">{electricityMeter.signalStrength}%</p>
              </div>
              <div>
                <span className="text-muted-foreground">Baterai</span>
                <p className="font-semibold text-foreground">{electricityMeter.batteryLevel}%</p>
              </div>
              <div>
                <span className="text-muted-foreground">Telemetri</span>
                <p className="font-semibold text-foreground">
                  {Math.floor((now - new Date(electricityMeter.lastTelemetry).getTime()) / 60000)} min lalu
                </p>
              </div>
            </div>
          </Card>
        )}

        {waterMeter && (
          <Card className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Droplets size={18} className="text-blue-500" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Meter Air</p>
                  <p className="text-xs text-muted-foreground">ID: {waterMeter.id}</p>
                </div>
              </div>
              {waterMeter.tampering && <AlertTriangle size={16} className="text-destructive" />}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Status Koneksi</span>
                <p
                  className={`font-semibold ${waterMeter.connectivity === "connected" ? "text-primary" : "text-destructive"}`}
                >
                  {waterMeter.connectivity === "connected" ? "Terhubung" : "Terputus"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Sinyal</span>
                <p className="font-semibold text-foreground">{waterMeter.signalStrength}%</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Telemetri</span>
                <p className="font-semibold text-foreground">
                  {Math.floor((now - new Date(waterMeter.lastTelemetry).getTime()) / 60000)} min lalu
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Last Sync Info */}
      <Card className="p-3 bg-muted/50">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-muted-foreground" />
          <div className="text-xs">
            <p className="text-muted-foreground">Sinkronisasi terakhir</p>
            <p className="font-medium text-foreground">{lastUpdated}</p>
          </div>
        </div>
      </Card>

      {/* Alerts */}
      {anyTampering && (
        <Card className="p-4 border-destructive/50 bg-destructive/5">
          <div className="flex gap-3">
            <AlertTriangle size={18} className="text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">Peringatan Keamanan</p>
              <p className="text-xs text-muted-foreground mt-1">
                Deteksi kemungkinan perusakan meter. Hubungi teknisi segera.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
