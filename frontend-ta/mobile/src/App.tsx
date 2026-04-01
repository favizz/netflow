"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import {
  Home, ShoppingCart, LogOut, Zap, Sun, Moon,
  Bell, ShieldAlert, Droplets, WifiOff, BatteryWarning, AlertTriangle,
  CheckCircle, Activity, TrendingUp, Gauge, RotateCcw, Cpu,
} from "lucide-react"
import Dashboard from "@/components/dashboard"
import TokenPurchase from "@/components/token-purchase"
import LoginForm from "@/components/login-form"
import { api, authStore, type AnomalyItem, type AnomalyType, type UnitSummary } from "@/lib/api"
import { interactive, type Page } from "@/lib/styles"

// ── Anomaly metadata ──────────────────────────────────────────────────────────
const ANOMALY_META: Record<
  AnomalyType,
  { label: string; Icon: React.ElementType; action: string }
> = {
  low_balance:        { label: "Saldo Hampir Habis",      Icon: BatteryWarning, action: "Segera beli token di menu Beli Token." },
  mcb_trip:           { label: "MCB Trip / Overload",     Icon: Zap,            action: "Kurangi beban listrik, lalu nyalakan ulang relay dari Beranda." },
  water_leak:         { label: "Kebocoran Air",           Icon: Droplets,       action: "Periksa seluruh kran dan pipa. Hubungi teknisi jika tidak ditemukan." },
  voltage_anomaly:    { label: "Tegangan Tidak Normal",   Icon: AlertTriangle,  action: "Hentikan pemakaian perangkat sensitif dan laporkan ke pengelola." },
  sensor_malfunction: { label: "Sensor Tidak Berfungsi",  Icon: Cpu,            action: "Hubungi teknisi untuk pemeriksaan sensor dan kabel." },
  low_power_factor:   { label: "Faktor Daya Rendah",      Icon: Gauge,          action: "Kurangi beban induktif atau hubungi teknisi listrik." },
  zero_flow:          { label: "Tidak Ada Aliran Air",    Icon: RotateCcw,      action: "Periksa kondisi pipa, katup, dan suplai air dari pengelola." },
  usage_spike:        { label: "Lonjakan Konsumsi",       Icon: TrendingUp,     action: "Periksa perangkat yang baru dinyalakan. Matikan yang tidak diperlukan." },
  backflow:           { label: "Aliran Air Balik",        Icon: Activity,       action: "Laporkan ke pengelola — kemungkinan masalah instalasi pipa." },
  jailbreak:          { label: "Bypass Sistem",           Icon: ShieldAlert,    action: "Hubungi pengelola gedung segera." },
  device_offline:     { label: "Perangkat Offline",       Icon: WifiOff,        action: "Hubungi pengelola untuk pemeriksaan perangkat." },
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { theme, setTheme } = useTheme()
  const [currentPage, setCurrentPage]         = useState<Page>("home")
  const [isLoggedIn, setIsLoggedIn]           = useState(false)
  const [userUnit, setUserUnit]               = useState("")
  const [availableUnits, setAvailableUnits]   = useState<UnitSummary[]>([])
  const [anomalies, setAnomalies]             = useState<AnomalyItem[]>([])

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    const bootstrap = async () => {
      if (!authStore.getToken()) return
      try {
        const me = await api.me()
        if (!active) return
        setAvailableUnits(me.units)
        if (me.unitNo) {
          setUserUnit(me.unitNo); setIsLoggedIn(true)
        } else if (me.units.length > 0) {
          const sel = await api.selectUnit(me.units[0].id)
          if (!active) return
          setUserUnit(sel.unitNo!); setAvailableUnits(sel.units); setIsLoggedIn(true)
        } else {
          authStore.clear()
        }
      } catch { if (!active) return; authStore.clear() }
    }
    void bootstrap()
    return () => { active = false }
  }, [])

  // ── Poll anomalies every 30 s ──────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn || !userUnit) return
    let active = true
    const load = async () => {
      try { const a = await api.getAnomalies(userUnit); if (active) setAnomalies(a) }
      catch { if (active) setAnomalies([]) }
    }
    void load()
    const id = setInterval(() => void load(), 30_000)
    return () => { active = false; clearInterval(id) }
  }, [isLoggedIn, userUnit])

  const criticalCount = anomalies.filter((a) => a.severity === "critical").length
  const alertCount    = anomalies.length

  // ── Auth helpers ──────────────────────────────────────────────────────────
  const applyLoginResult = async (result: { unitNo: string | null; units: UnitSummary[] }) => {
    setAvailableUnits(result.units)
    if (result.unitNo) {
      setUserUnit(result.unitNo); setIsLoggedIn(true)
    } else if (result.units.length > 0) {
      const sel = await api.selectUnit(result.units[0].id)
      setUserUnit(sel.unitNo!); setAvailableUnits(sel.units); setIsLoggedIn(true)
    }
  }

  const handleGoogleLogin = async (c: string) => { await applyLoginResult(await api.googleLogin(c)) }
  const handleDevLogin    = async (e: string) => { await applyLoginResult(await api.devLogin(e)) }
  const handleSelectUnit  = async (unitId: number) => {
    const r = await api.selectUnit(unitId)
    if (!r.unitNo) throw new Error("Unit selection failed")
    setUserUnit(r.unitNo); setAvailableUnits(r.units); setCurrentPage("home")
  }
  const handleLogout = async () => {
    await api.logout()
    setIsLoggedIn(false); setCurrentPage("home")
    setUserUnit(""); setAvailableUnits([]); setAnomalies([])
  }

  if (!isLoggedIn) {
    return <LoginForm onGoogleLogin={handleGoogleLogin} onDevLogin={handleDevLogin} />
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex-none z-30 bg-card border-b border-border flex items-center justify-between px-5 h-14">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
            <Zap size={16} />
          </div>
          <span className="font-bold text-base text-foreground tracking-tight">Smart Meter</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`${interactive.ghost} text-muted-foreground`}
            aria-label="Ganti tema"
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            onClick={() => void handleLogout()}
            className={`${interactive.ghost} text-muted-foreground hover:text-destructive`}
            aria-label="Keluar"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* ── Page content ───────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {currentPage === "home" && (
          <Dashboard unitId={userUnit} availableUnits={availableUnits} onSelectUnit={handleSelectUnit} />
        )}
        {currentPage === "purchase" && (
          <TokenPurchase unitId={userUnit} onBack={() => setCurrentPage("home")} />
        )}
        {currentPage === "notifications" && (
          <NotificationsPage anomalies={anomalies} />
        )}
      </main>

      {/* ── Bottom nav with centre FAB ──────────────────────────────────── */}
      <nav className="flex-none relative h-16 bg-card/95 backdrop-blur-sm border-t border-border z-20 overflow-visible">
        <div className="flex h-full">
          {/* Left — Beli Token */}
          <button
            onClick={() => setCurrentPage("purchase")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-150 ${
              currentPage === "purchase" ? interactive.navActive : interactive.navInactive
            }`}
          >
            <ShoppingCart size={22} />
            <span className="text-xs font-medium">Beli Token</span>
          </button>

          {/* Centre spacer — keeps left/right balanced */}
          <div className="w-20 flex-shrink-0" />

          {/* Right — Notifikasi */}
          <button
            onClick={() => setCurrentPage("notifications")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-150 relative ${
              currentPage === "notifications" ? interactive.navActive : interactive.navInactive
            }`}
          >
            <div className="relative">
              <Bell size={22} />
              {alertCount > 0 && (
                <span
                  className={`absolute -top-1 -right-1 w-4 h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none ${
                    criticalCount > 0 ? "bg-status-critical" : "bg-status-warn"
                  }`}
                >
                  {Math.min(alertCount, 9)}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">Notifikasi</span>
          </button>
        </div>

        {/* Centre FAB — Beranda, pops out above the nav */}
        <button
          onClick={() => setCurrentPage("home")}
          className={`
            absolute left-1/2 -translate-x-1/2 -top-5
            w-14 h-14 rounded-full
            flex items-center justify-center
            shadow-lg transition-all duration-150 active:scale-95
            ${currentPage === "home"
              ? "bg-primary text-primary-foreground shadow-primary/40 ring-4 ring-background"
              : "bg-primary/90 text-primary-foreground shadow-primary/20 ring-4 ring-background hover:bg-primary"
            }
          `}
          aria-label="Beranda"
        >
          <Home size={24} />
        </button>
      </nav>

    </div>
  )
}

// ── Full-screen notifications page ────────────────────────────────────────────
function NotificationsPage({ anomalies }: { anomalies: AnomalyItem[] }) {
  const criticalCount = anomalies.filter((a) => a.severity === "critical").length
  const warningCount  = anomalies.filter((a) => a.severity === "warning").length

  return (
    <div className="p-5 space-y-4">

      {/* Heading */}
      <div className="flex items-center gap-2 pt-1">
        <Bell size={20} className="text-primary" />
        <h1 className="text-xl font-bold text-foreground">Notifikasi</h1>
        {criticalCount > 0 && (
          <span className="text-xs font-bold bg-status-critical/10 text-status-critical px-2 py-0.5 rounded-full">
            {criticalCount} kritis
          </span>
        )}
        {warningCount > 0 && (
          <span className="text-xs font-bold bg-status-warn/10 text-status-warn px-2 py-0.5 rounded-full">
            {warningCount} peringatan
          </span>
        )}
      </div>

      {/* Empty state */}
      {anomalies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <CheckCircle size={40} className="text-primary opacity-40" />
          <p className="text-sm font-medium">Semua normal</p>
          <p className="text-xs text-center max-w-xs">
            Tidak ada anomali terdeteksi. Sistem berjalan normal.
          </p>
        </div>
      )}

      {/* Anomaly cards */}
      {anomalies.length > 0 && (
        <div className="space-y-3">
          {anomalies.map((a, idx) => {
            const meta = ANOMALY_META[a.anomalyType] ?? {
              label: a.anomalyType,
              Icon: AlertTriangle,
              action: "",
            }
            const isCritical = a.severity === "critical"
            const colorWrap  = isCritical
              ? "bg-status-critical/8 border-status-critical/25"
              : "bg-status-warn/8 border-status-warn/25"
            const colorIcon  = isCritical ? "text-status-critical" : "text-status-warn"
            const colorBadge = isCritical
              ? "bg-status-critical text-white"
              : "bg-status-warn/15 text-status-warn"

            return (
              <div key={idx} className={`rounded-2xl border p-4 space-y-2 ${colorWrap}`}>
                {/* Top row: icon + label + badge */}
                <div className="flex items-center gap-2">
                  <meta.Icon size={18} className={`flex-shrink-0 ${colorIcon}`} />
                  <span className={`text-sm font-semibold ${colorIcon}`}>{meta.label}</span>
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${colorBadge}`}>
                    {isCritical ? "Kritis" : "Peringatan"}
                  </span>
                </div>

                {/* Message */}
                <p className="text-sm text-foreground leading-snug">{a.message}</p>

                {/* Action hint */}
                {meta.action && (
                  <div className="flex gap-1.5 items-start pt-0.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0 mt-0.5">
                      Tindakan:
                    </span>
                    <p className="text-xs text-muted-foreground leading-snug">{meta.action}</p>
                  </div>
                )}

                {/* Timestamp */}
                <p className="text-[11px] text-muted-foreground/60">{formatTimeAgo(a.detectedAt)}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer note */}
      {/* <p className="text-xs text-muted-foreground/50 text-center pb-4">
        Data diperbarui setiap 30 detik
      </p> */}
    </div>
  )
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return "Baru saja"
  if (mins < 60) return `${mins} menit lalu`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs} jam lalu`
  return `${Math.floor(hrs / 24)} hari lalu`
}
