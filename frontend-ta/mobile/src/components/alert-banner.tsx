import { AlertCircle, Info, AlertTriangle } from "lucide-react"

interface AlertBannerProps {
  type: "warning" | "error" | "info"
  message: string
}

export default function AlertBanner({ type, message }: AlertBannerProps) {
  const styles = {
    warning: {
      wrap: "bg-status-warn/10 border-status-warn/30",
      icon: "text-status-warn",
      text: "text-status-warn",
    },
    error: {
      wrap: "bg-status-critical/10 border-status-critical/30",
      icon: "text-status-critical",
      text: "text-status-critical",
    },
    info: {
      wrap: "bg-primary/5 border-primary/20",
      icon: "text-primary",
      text: "text-primary",
    },
  }

  const s = styles[type]
  const Icon = type === "warning" ? AlertTriangle : type === "error" ? AlertCircle : Info

  return (
    <div className={`border rounded-xl p-3 flex gap-3 ${s.wrap}`}>
      <Icon size={18} className={`flex-shrink-0 mt-0.5 ${s.icon}`} />
      <p className={`text-sm ${s.text}`}>{message}</p>
    </div>
  )
}
