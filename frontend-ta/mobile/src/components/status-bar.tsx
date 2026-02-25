interface StatusBarProps {
  percentage: number
  status: "aman" | "warning" | "critical" | "cut-off" | "kritis" | "kurang" | "terputus"
}

export default function StatusBar({ percentage, status }: StatusBarProps) {
  const getStatusColor = (s: string) => {
    switch (s) {
      case "aman":
        return "bg-primary"
      case "warning":
        return "bg-yellow-500"
      case "critical":
      case "kritis":
      case "kurang":
        return "bg-destructive"
      case "cut-off":
      case "terputus":
        return "bg-gray-500"
      default:
        return "bg-primary"
    }
  }

  return (
    <div className="space-y-2">
      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 rounded-full ${getStatusColor(status)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">{percentage.toFixed(0)}%</p>
    </div>
  )
}
