"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { api, type AnomalyItem } from "@/lib/api"

interface AuditEntry {
  id: string
  timestamp: string
  action: string
  type: "info" | "warning" | "error"
  details: string
}

interface SystemAuditLogProps {
  unitNo?: string
  entries?: AuditEntry[]
}

function anomalyToAudit(a: AnomalyItem, idx: number): AuditEntry {
  const typeMap: Record<string, "info" | "warning" | "error"> = {
    critical: "error",
    warning: "warning",
    info: "info",
  }
  return {
    id: `anomaly-${idx}`,
    timestamp: a.detectedAt,
    action: a.anomalyType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    type: typeMap[a.severity] ?? "info",
    details: a.message,
  }
}

export default function SystemAuditLog({ unitNo, entries }: SystemAuditLogProps) {
  const [loaded, setLoaded] = useState<AuditEntry[] | null>(null)
  const [error, setError]   = useState(false)

  useEffect(() => {
    if (!unitNo) return
    api.getAnomalies(unitNo)
      .then((items) => setLoaded(items.map(anomalyToAudit)))
      .catch(() => setError(true))
  }, [unitNo])

  const displayEntries: AuditEntry[] =
    entries ??
    (loaded !== null ? loaded : [])

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

  if (unitNo && loaded === null && !error) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground text-sm">
        <Loader2 size={16} className="animate-spin" />
        Memuat log...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">Log Audit Sistem</p>
      {displayEntries.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">Tidak ada log untuk ditampilkan.</p>
      )}
      <div className="space-y-2">
        {displayEntries.map((entry) => (
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
