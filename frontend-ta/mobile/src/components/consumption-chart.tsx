"use client"

import { useState, useCallback } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts"

interface ConsumptionChartProps {
  data: { [key: string]: string | number }[]
  dataKey: string
  unit: string
  period: "daily" | "yearly" | "monthly"
  color: string
  isLive?: boolean
}

// Persistent label that shows on tap/touch instead of hover
function MobileTouchLabel({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean
  payload?: { value: string | number }[]
  label?: string
  unit: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const val = payload[0]?.value
  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-md"
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
        color: "var(--foreground)",
        pointerEvents: "none",
      }}
    >
      <p style={{ color: "var(--muted-foreground)", marginBottom: 2 }}>{label}</p>
      <p className="font-bold">
        {typeof val === "number" ? val.toFixed(2) : val} {unit}
      </p>
    </div>
  )
}

export default function ConsumptionChart({
  data,
  dataKey,
  unit,
  color,
  isLive = false,
}: ConsumptionChartProps) {
  const [activePoint, setActivePoint] = useState<{ value: number; label: string } | null>(null)

  const handleMouseMove = useCallback(
    (e: { activePayload?: { value: number }[]; activeLabel?: string | number }) => {
      if (e?.activePayload?.[0]) {
        setActivePoint({
          value: e.activePayload[0].value,
          label: e.activeLabel != null ? String(e.activeLabel) : "",
        })
      }
    },
    []
  )

  const handleMouseLeave = useCallback(() => {
    // Don't clear on leave - keep last value visible for mobile
  }, [])

  // Always show latest value if no point selected
  const latestPoint = data.length > 0 ? data[data.length - 1] : null
  const displayValue = activePoint?.value ?? (latestPoint ? latestPoint[dataKey] : null)
  const displayLabel = activePoint?.label ?? latestPoint?.date ?? ""

  return (
    <div className="space-y-2 min-h-[220px]">
      {!isLive && displayValue != null && (
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-2xl font-bold tabular-nums"
            style={{ color }}
          >
            {Number(displayValue).toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">{unit}</span>
          {displayLabel && (
            <span className="ml-auto text-xs text-muted-foreground">{displayLabel}</span>
          )}
        </div>
      )}

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="10%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          {/* No tooltip — always-visible chip above handles the value display */}
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#fill-${dataKey})`}
            dot={false}
            activeDot={isLive ? false : { r: 5, fill: color, strokeWidth: 2, stroke: "var(--card)" }}
            isAnimationActive={!isLive}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
