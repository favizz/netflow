"use client"

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface ChartData {
  date: string
  kwh: number
  water: number
  fullDate: string
}

interface ConsumptionChartProps {
  data: any[]
  dataKey: string
  unit: string
  period: "daily" | "weekly" | "monthly"
  color: string
}

export default function ConsumptionChart({ data, dataKey, unit, period, color }: ConsumptionChartProps) {
  const isDaily = period === "daily"

  return (
    <ResponsiveContainer width="100%" height={300}>
      {isDaily ? (
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
          <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: `1px solid var(--border)`,
              borderRadius: "6px",
            }}
            formatter={(value: number) => [`${value} ${unit}`, "Nilai"]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            dot={{ fill: color, r: 3 }}
            activeDot={{ r: 5 }}
            strokeWidth={2}
          />
        </LineChart>
      ) : (
        <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
          <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: `1px solid var(--border)`,
              borderRadius: "6px",
            }}
            formatter={(value: number) => [`${value} ${unit}`, "Nilai"]}
          />
          <Bar dataKey={dataKey} fill={color} radius={[8, 8, 0, 0]} />
        </BarChart>
      )}
    </ResponsiveContainer>
  )
}
