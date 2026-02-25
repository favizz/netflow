"use client"

import { Zap, Droplets, Power } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface DeviceControlProps {
  type: "electricity" | "water"
  status: "on" | "off"
  onToggle: (newStatus: "on" | "off") => void
  isLoading?: boolean
}

export default function DeviceControl({ type, status, onToggle, isLoading }: DeviceControlProps) {
  const [confirmToggle, setConfirmToggle] = useState(false)
  const icon = type === "electricity" ? Zap : Droplets
  const label = type === "electricity" ? "Listrik" : "Air"
  const bgColor = type === "electricity" ? "bg-primary/10" : "bg-blue-500/10"
  const textColor = type === "electricity" ? "text-primary" : "text-blue-500"

  const handleToggle = () => {
    const newStatus = status === "on" ? "off" : "on"
    onToggle(newStatus)
    setConfirmToggle(false)
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${bgColor}`}>
            {icon && <div className={`w-5 h-5 ${textColor}`}>{icon({})}</div>}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className={`text-xs font-medium ${status === "on" ? "text-primary" : "text-destructive"}`}>
              Status: {status === "on" ? "HIDUP" : "MATI"}
            </p>
          </div>
        </div>

        {confirmToggle ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setConfirmToggle(false)} className="text-xs">
              Batalkan
            </Button>
            <Button
              size="sm"
              onClick={handleToggle}
              disabled={isLoading}
              className="text-xs"
              variant={status === "on" ? "destructive" : "default"}
            >
              {isLoading ? "..." : status === "on" ? "Matikan" : "Nyalakan"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirmToggle(true)} className="gap-1">
            <Power size={14} />
            {status === "on" ? "Matikan" : "Nyalakan"}
          </Button>
        )}
      </div>
    </Card>
  )
}
