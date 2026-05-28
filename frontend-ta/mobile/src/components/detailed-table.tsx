interface TableData {
  date: string
  kwh: number
  water: number
  watts?: number
  flowRate?: number
  voltage?: number
  current?: number
  fullDate: string
}

interface DetailedTableProps {
  data: TableData[]
  utility: "kwh" | "water"
  isLive?: boolean
}

export default function DetailedTable({
  data,
  utility,
  isLive = false,
}: DetailedTableProps) {
  const rows = data.slice(-10).reverse()

  // ── Live electricity: Time | Daya | Tegangan | Arus ─────────────
  if (isLive && utility === "kwh") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-2 font-semibold text-foreground">Waktu</th>
              <th className="text-right py-3 px-2 font-semibold text-foreground">Daya (W)</th>
              <th className="text-right py-3 px-2 font-semibold text-foreground">Tegangan (V)</th>
              <th className="text-right py-3 px-2 font-semibold text-foreground">Arus (A)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                <td className="py-3 px-2 text-muted-foreground">{row.date}</td>
                <td className="py-3 px-2 text-right font-semibold text-foreground">
                  {(row.watts ?? 0).toFixed(1)}
                </td>
                <td className="py-3 px-2 text-right text-muted-foreground">
                  {(row.voltage ?? 0).toFixed(1)}
                </td>
                <td className="py-3 px-2 text-right text-muted-foreground">
                  {(row.current ?? 0).toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Live water: Time | Debit ─────────────────────────────────────
  if (isLive && utility === "water") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-2 font-semibold text-foreground">Waktu</th>
              <th className="text-right py-3 px-2 font-semibold text-foreground">Debit (L/min)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                <td className="py-3 px-2 text-muted-foreground">{row.date}</td>
                <td className="py-3 px-2 text-right font-semibold text-foreground">
                  {(row.flowRate ?? 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Period electricity: Tanggal | Konsumsi (kWh) ───────────────
  if (utility === "kwh") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-2 font-semibold text-foreground">Tanggal</th>
              <th className="text-right py-3 px-2 font-semibold text-foreground">Konsumsi (kWh)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                <td className="py-3 px-2 text-muted-foreground">{row.date}</td>
                <td className="py-3 px-2 text-right font-semibold text-foreground">
                  {row.kwh.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Period water: Tanggal | Volume (m³) ─────────────────────────
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-2 font-semibold text-foreground">Tanggal</th>
            <th className="text-right py-3 px-2 font-semibold text-foreground">Volume (m³)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
              <td className="py-3 px-2 text-muted-foreground">{row.date}</td>
              <td className="py-3 px-2 text-right font-semibold text-foreground">
                {row.water.toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
