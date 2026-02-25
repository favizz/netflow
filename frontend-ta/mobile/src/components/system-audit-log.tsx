"use client"

import { Card } from "@/components/ui/card"
import { AlertCircle, CheckCircle2 } from "lucide-react"

interface AuditEntry {
  id: string
  timestamp: string
  action: string
  type: "info" | "warning" | "error"
  details: string
}

interface SystemAuditLogProps {
  entries?: AuditEntry[]
}

export default function SystemAuditLog({ entries }: SystemAuditLogProps) {
  // Mock audit entries
  const mockEntries: AuditEntry[] = entries || [
    {
      id: "audit-1",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      action: "Meter Sinkronisasi",
      type: "info",
      details: "Meter listrik dan air berhasil disinkronkan dengan server",
    },
    {
      id: "audit-2",
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      action: "Transaksi Berhasil",
      type: "info",
      details: "Token senilai Rp 100.000 berhasil ditambahkan (45 KWh)",
    },
    {
      id: "audit-3",
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      action: "Konsumsi Terukur",
      type: "info",
      details: "Konsumsi harian 12.5 KWh tercatat dalam sistem",
    },
    {
      id: "audit-4",
      timestamp: new Date(Date.now() - 172800000).toISOString(),
      action: "Peringatan Saldo Rendah",
      type: "warning",
      details: "Saldo KWh di bawah 20 unit - rekomendasi pengisian ulang",
    },
  ]

  const getIcon = (type: string) => {
    switch (type) {
      case "error":
        return <AlertCircle size={16} className="text-destructive" />
      case "warning":
        return <AlertCircle size={16} className="text-amber-500" />
      case "info":
      default:
        return <CheckCircle2 size={16} className="text-primary" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "error":
        return "text-destructive"
      case "warning":
        return "text-amber-500"
      case "info":
      default:
        return "text-primary"
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">Log Audit Sistem</p>
      <div className="space-y-2">
        {mockEntries.map((entry) => (
          <Card key={entry.id} className="p-4">
            <div className="flex gap-3">
              <div className="mt-1 flex-shrink-0">{getIcon(entry.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`text-sm font-semibold ${getTypeColor(entry.type)}`}>{entry.action}</p>
                    <p className="text-xs text-muted-foreground mt-1">{entry.details}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(entry.timestamp).toLocaleString("id-ID")}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
