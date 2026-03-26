import { DEFAULT_TARIFF } from "@/lib/styles"

interface TableData {
  date: string
  kwh: number
  water: number
  watts?: number
  flowRate?: number
  fullDate: string
}

interface DetailedTableProps {
  data: TableData[]
  utility: "kwh" | "water"
  tariff?: { kwh: number; water: number }
}

export default function DetailedTable({ data, utility, tariff = DEFAULT_TARIFF }: DetailedTableProps) {
  const displayData = data.slice(-10).reverse()

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-2 font-semibold text-foreground">Tanggal / Waktu</th>
            <th className="text-right py-3 px-2 font-semibold text-foreground">
              {utility === "kwh" ? "Pemakaian (KWh)" : "Volume (m³)"}
            </th>
            <th className="text-right py-3 px-2 font-semibold text-foreground">
              {utility === "kwh" ? "Intensitas (Watt)" : "Debit (L/min)"}
            </th>
            <th className="text-right py-3 px-2 font-semibold text-foreground">Biaya (Rp)</th>
          </tr>
        </thead>
        <tbody>
          {displayData.map((row, idx) => {
            const usage = row[utility]
            const rate = utility === "kwh" ? (row.watts ?? 0) : (row.flowRate ?? 0)
            const cost = utility === "kwh" ? usage * tariff.kwh : usage * tariff.water

            return (
              <tr key={idx} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                <td className="py-3 px-2 text-muted-foreground">{row.date}</td>
                <td className="py-3 px-2 text-right font-semibold text-foreground">{usage.toFixed(4)}</td>
                <td className="py-3 px-2 text-right text-muted-foreground">{rate.toFixed(1)}</td>
                <td className="py-3 px-2 text-right text-primary font-semibold">{cost.toLocaleString("id-ID")}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
