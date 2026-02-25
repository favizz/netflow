"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { AlertTriangle, Wrench, BarChart3 } from "lucide-react"
import SystemHealthDashboard from "./system-health-dashboard"
import SystemAuditLog from "./system-audit-log"
import DeviceControl from "./device-control"
import type { DeviceStatus } from "@/hooks/use-app-state"

interface AdminViewProps {
  devices: DeviceStatus[]
  unitId: string
  lastUpdated: string
  onDeviceToggle: (deviceId: string, newStatus: "on" | "off") => void
}

export default function AdminView({ devices, unitId, lastUpdated, onDeviceToggle }: AdminViewProps) {
  const [selectedTab, setSelectedTab] = useState<"health" | "devices" | "audit">("health")

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Wrench size={24} className="text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Panel Teknisi</h1>
        </div>
        <p className="text-sm text-muted-foreground">Unit: {unitId}</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setSelectedTab("health")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            selectedTab === "health"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            <BarChart3 size={16} />
            Kesehatan Sistem
          </div>
        </button>
        <button
          onClick={() => setSelectedTab("devices")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            selectedTab === "devices"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            <Wrench size={16} />
            Kontrol Perangkat
          </div>
        </button>
        <button
          onClick={() => setSelectedTab("audit")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            selectedTab === "audit"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            Log Audit
          </div>
        </button>
      </div>

      {/* Content */}
      <div>
        {selectedTab === "health" && <SystemHealthDashboard devices={devices} lastUpdated={lastUpdated} />}

        {selectedTab === "devices" && (
          <div className="space-y-4">
            <Card className="p-4 border-amber-500/30 bg-amber-500/5">
              <div className="flex gap-3">
                <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-900">Peringatan</p>
                  <p className="text-xs text-amber-800 mt-1">
                    Kontrol perangkat hanya dapat diakses oleh personel terotorisasi. Semua tindakan akan dicatat.
                  </p>
                </div>
              </div>
            </Card>

            <div className="space-y-4">
              {devices.map((device) => (
                <DeviceControl
                  key={device.id}
                  type={device.type}
                  status={device.status}
                  onToggle={(newStatus) => onDeviceToggle(device.id, newStatus)}
                />
              ))}
            </div>
          </div>
        )}

        {selectedTab === "audit" && <SystemAuditLog />}
      </div>
    </div>
  )
}
