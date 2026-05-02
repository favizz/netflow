import { type BalanceStatus } from "@/lib/styles"

interface StatusBarProps {
  percentage: number
  status: BalanceStatus
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function StatusBar(_props: StatusBarProps) {
  // The progress bar and percentage are commented out as the textual status pill is sufficient
  /*
  return (
    <div className="space-y-2">
      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 rounded-full ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">{Math.min(100, Math.max(0, percentage)).toFixed(0)}%</p>
    </div>
  )
  */
  return null
}
