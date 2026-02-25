import { AlertCircle, Info, AlertTriangle } from "lucide-react"

interface AlertBannerProps {
  type: "warning" | "error" | "info"
  message: string
}

export default function AlertBanner({ type, message }: AlertBannerProps) {
  const colors = {
    warning: {
      bg: "bg-yellow-50 dark:bg-yellow-950",
      border: "border-yellow-200 dark:border-yellow-800",
      icon: "text-yellow-600 dark:text-yellow-400",
      text: "text-yellow-800 dark:text-yellow-100",
    },
    error: {
      bg: "bg-destructive/5",
      border: "border-destructive/30",
      icon: "text-destructive",
      text: "text-destructive",
    },
    info: {
      bg: "bg-primary/5",
      border: "border-primary/30",
      icon: "text-primary",
      text: "text-primary",
    },
  }

  const color = colors[type]
  const Icon = type === "warning" ? AlertTriangle : type === "error" ? AlertCircle : Info

  return (
    <div className={`border rounded-lg p-3 flex gap-3 ${color.bg} ${color.border}`}>
      <Icon size={18} className={`flex-shrink-0 mt-0.5 ${color.icon}`} />
      <p className={`text-sm ${color.text}`}>{message}</p>
    </div>
  )
}
