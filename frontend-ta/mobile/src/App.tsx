"use client"

import { useEffect, useState, useRef } from "react"
import { useTheme } from "next-themes"
import {
  Home, ShoppingCart, LogOut, Zap, Sun, Moon,
  Bell, ShieldAlert, Droplets, WifiOff, BatteryWarning, AlertTriangle,
  CheckCircle, TrendingUp, Gauge, Cpu, ChevronDown,
} from "lucide-react"
import Dashboard from "@/components/dashboard"
import TokenPurchase from "@/components/token-purchase"
import LoginForm from "@/components/login-form"
import { api, authStore, type AnomalyItem, type AnomalyType, type UnitSummary } from "@/lib/api"
import { interactive, dropdown, MOBILE_NOTIF_KEY, type Page } from "@/lib/styles"
import { cn } from "@/lib/utils"
import logoWhite from "@/assets/netflow-logo-white.png"
import logoBlack from "@/assets/netflow-logo-black.png"

// ── Anomaly metadata ──────────────────────────────────────────────────────────
const ANOMALY_META: Record<
  AnomalyType,
  { label: string; Icon: React.ElementType; action: string }
> = {
  low_electricity_token: { label: "Token Listrik Hampir Habis", Icon: BatteryWarning, action: "Segera beli token listrik di menu Beli Token." },
  low_water_token:       { label: "Token Air Hampir Habis",     Icon: BatteryWarning, action: "Segera beli token air di menu Beli Token." },
  mcb_trip:              { label: "MCB Trip / Overload",        Icon: Zap,            action: "Kurangi beban listrik, lalu nyalakan ulang relay dari Beranda." },
  water_leak:            { label: "Kebocoran Air",              Icon: Droplets,       action: "Periksa seluruh kran dan pipa. Hubungi teknisi jika tidak ditemukan." },
  voltage_anomaly:       { label: "Tegangan Tidak Normal",      Icon: AlertTriangle,  action: "Hentikan pemakaian perangkat sensitif dan laporkan ke pengelola." },
  sensor_malfunction:    { label: "Sensor Tidak Berfungsi",     Icon: Cpu,            action: "Hubungi teknisi untuk pemeriksaan sensor dan kabel." },
  low_power_factor:      { label: "Faktor Daya Rendah",         Icon: Gauge,          action: "Kurangi beban induktif atau hubungi teknisi listrik." },
  usage_spike:           { label: "Lonjakan Konsumsi",          Icon: TrendingUp,     action: "Periksa perangkat yang baru dinyalakan. Matikan yang tidak diperlukan." },
  jailbreak:             { label: "Bypass Sistem",              Icon: ShieldAlert,    action: "Hubungi pengelola gedung segera." },
  device_offline:        { label: "Perangkat Offline",          Icon: WifiOff,        action: "Hubungi pengelola untuk pemeriksaan perangkat." },
  zero_flow:             { label: "Aliran Air Nol",             Icon: Droplets,       action: "Valve terbuka namun tidak ada aliran. Periksa pipa atau hubungi pengelola." },
  backflow:              { label: "Aliran Air Balik",           Icon: Droplets,       action: "Terdeteksi aliran balik. Hubungi teknisi segera." },
  topup_success:         { label: "Pembayaran Token Berhasil",  Icon: CheckCircle,    action: "Menunggu sinkronisasi perangkat." },
}

// ── Unit selector (custom dropdown, no system UI) ─────────────────────────────
function UnitSelector({ units, current, onSelect }: {
  units: UnitSummary[]
  current: string
  onSelect: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (units.length <= 1) {
    return <span className={cn(dropdown.chip, "flex-1 min-w-0")}>Unit {current}</span>
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button onClick={() => setOpen(o => !o)} className={dropdown.trigger}>
        <span className="truncate">Unit {current}</span>
        <ChevronDown size={14} className={cn("shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div className={dropdown.panel}>
          {units.map(u => (
            <button
              key={u.id}
              onClick={() => { onSelect(u.id); setOpen(false) }}
              className={cn(dropdown.item, u.unitNo === current ? dropdown.itemActive : dropdown.itemDefault)}
            >
              Unit {u.unitNo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { theme, setTheme } = useTheme()
  const [currentPage, setCurrentPage]         = useState<Page>("home")
  const [isLoggedIn, setIsLoggedIn]           = useState(false)
  const [userUnit, setUserUnit]               = useState("")
  const [userName, setUserName]               = useState("")
  const [availableUnits, setAvailableUnits]   = useState<UnitSummary[]>([])
  const [anomalies, setAnomalies]             = useState<AnomalyItem[]>([])
  const [notifLastRead, setNotifLastRead]     = useState<Date | null>(() => {
    try { const v = localStorage.getItem(MOBILE_NOTIF_KEY); return v ? new Date(v) : null } catch { return null }
  })
  const prevPage = useRef<Page>("home")

  // ── Mark notifications as read when leaving the page ─────────────────────
  useEffect(() => {
    if (prevPage.current === "notifications" && currentPage !== "notifications") {
      const now = new Date()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotifLastRead(now)
      try { localStorage.setItem(MOBILE_NOTIF_KEY, now.toISOString()) } catch { /* ignore */ }
    }
    prevPage.current = currentPage
  }, [currentPage])

  // ── Force-logout when tokens are cleared mid-session ─────────────────────
  useEffect(() => {
    const handler = () => {
      setIsLoggedIn(false)
      setUserUnit('')
      setUserName('')
      setAnomalies([])
    }
    window.addEventListener('auth:cleared', handler)
    return () => window.removeEventListener('auth:cleared', handler)
  }, [])

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    const bootstrap = async () => {
      if (!authStore.getToken()) return
      try {
        const me = await api.me()
        if (!active) return
        setAvailableUnits(me.units)
        if (me.name) setUserName(me.name)
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
      if (!authStore.getToken()) return
      try { const a = await api.getAnomalies(userUnit); if (active) setAnomalies(a) }
      catch { if (active) setAnomalies([]) }
    }
    void load()
    const id = setInterval(() => void load(), 30_000)
    return () => { active = false; clearInterval(id) }
  }, [isLoggedIn, userUnit])

  const unreadAnomalies = anomalies.filter(a => !notifLastRead || new Date(a.detectedAt) > notifLastRead)
  const criticalCount   = unreadAnomalies.filter(a => a.severity === "critical").length
  const alertCount      = unreadAnomalies.length

  // ── Auth helpers ──────────────────────────────────────────────────────────
  const applyLoginResult = async (result: { unitNo: string | null; units: UnitSummary[]; name?: string | null }) => {
    setAvailableUnits(result.units)
    if (result.name) setUserName(result.name)
    if (result.unitNo) {
      setUserUnit(result.unitNo); setIsLoggedIn(true)
    } else if (result.units.length > 0) {
      const sel = await api.selectUnit(result.units[0].id)
      setUserUnit(sel.unitNo!); setAvailableUnits(sel.units); setIsLoggedIn(true)
    } else {
      throw new Error(JSON.stringify({ message: 'Akun belum memiliki unit yang terdaftar. Hubungi administrator.' }))
    }
  }

  const handleGoogleLogin = async (c: string) => { await applyLoginResult(await api.googleLogin(c)) }
  const handleSelectUnit  = async (unitId: number) => {
    const r = await api.selectUnit(unitId)
    if (!r.unitNo) throw new Error("Unit selection failed")
    setUserUnit(r.unitNo); setAvailableUnits(r.units); setCurrentPage("home")
  }
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const handleLogout = async () => {
    await api.logout()
    setIsLoggedIn(false); setCurrentPage("home")
    setUserUnit(""); setUserName(""); setAvailableUnits([]); setAnomalies([])
  }

  if (!isLoggedIn) {
    return <LoginForm onGoogleLogin={handleGoogleLogin} />
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex-none z-30 bg-card border-b border-border flex items-center justify-between px-4 h-14 gap-3">
        <img src={theme === 'dark' ? logoWhite : logoBlack} alt="NetFlow" className="h-8 w-auto shrink-0" />

        {userUnit && (
          <UnitSelector units={availableUnits} current={userUnit} onSelect={handleSelectUnit} />
        )}

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`${interactive.ghost} text-muted-foreground`}
            aria-label="Ganti tema"
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={`${interactive.ghost} text-muted-foreground hover:text-destructive`}
            aria-label="Keluar"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* ── Page content ───────────────────────────────────────────────── */}
      {/* overflow-hidden here; each page owns its own scroll container   */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {currentPage === "home" && (
          <div className="h-full overflow-y-auto overflow-x-hidden">
            <Dashboard unitId={userUnit} availableUnits={availableUnits} onSelectUnit={handleSelectUnit} />
          </div>
        )}
        {currentPage === "purchase" && (
          <TokenPurchase unitId={userUnit} onBack={() => setCurrentPage("home")} />
        )}
        {currentPage === "notifications" && (
          <div className="h-full overflow-y-auto overflow-x-hidden">
            <NotificationsPage anomalies={anomalies} lastReadAt={notifLastRead} />
          </div>
        )}
      </main>

      {/* ── Bottom nav with centre FAB ──────────────────────────────────── */}
      <nav className="flex-none relative h-16 bg-card/95 backdrop-blur-sm border-t border-border z-20 overflow-visible">
        <div className="flex h-full">
          {/* Left - Beli Token */}
          <button
            onClick={() => setCurrentPage("purchase")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-150 ${
              currentPage === "purchase" ? interactive.navActive : interactive.navInactive
            }`}
          >
            <ShoppingCart size={22} />
            <span className="text-xs font-medium">Beli Token</span>
          </button>

          {/* Centre spacer - keeps left/right balanced */}
          <div className="w-20 flex-shrink-0" />

          {/* Right - Notifikasi */}
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

        {/* Centre FAB - Beranda, pops out above the nav */}
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

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-xs rounded-2xl bg-card shadow-xl ring-1 ring-border">
            <div className="p-6 flex flex-col items-center text-center gap-4">
              <p className="text-sm font-semibold text-foreground">
                Keluar dari pengguna <span className="font-normal text-muted-foreground">{userName || `Unit ${userUnit}`}</span>?
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-foreground active:bg-muted transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={() => { setShowLogoutConfirm(false); void handleLogout() }}
                  className="flex-1 h-11 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold active:bg-destructive/80 transition-colors"
                >
                  Keluar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Full-screen notifications page ────────────────────────────────────────────
function NotificationsPage({ anomalies, lastReadAt }: { anomalies: AnomalyItem[], lastReadAt: Date | null }) {
  const shown        = anomalies.slice(0, 10)
  const criticalCount = shown.filter((a) => a.severity === "critical").length
  const warningCount  = shown.filter((a) => a.severity === "warning").length

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
      {shown.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <CheckCircle size={40} className="text-primary opacity-40" />
          <p className="text-sm font-medium">Semua normal</p>
          <p className="text-xs text-center max-w-xs">
            Tidak ada anomali terdeteksi. Sistem berjalan normal.
          </p>
        </div>
      )}

      {/* Anomaly cards */}
      {shown.length > 0 && (
        <div className="space-y-3">
          {shown.map((a, idx) => {
            const meta = ANOMALY_META[a.anomalyType] ?? {
              label: a.anomalyType,
              Icon: AlertTriangle,
              action: "",
            }
            const isCritical = a.severity === "critical"
            const isInfo     = a.severity === "info"
            const isRead     = !!lastReadAt && new Date(a.detectedAt) <= lastReadAt
            const colorWrap  = isCritical
              ? "bg-status-critical/8 border-status-critical/25"
              : isInfo
              ? "bg-primary/8 border-primary/25"
              : "bg-status-warn/8 border-status-warn/25"
            const colorIcon  = isCritical
              ? "text-status-critical"
              : isInfo
              ? "text-primary"
              : "text-status-warn"
            const colorBadge = isCritical
              ? "bg-status-critical text-white"
              : isInfo
              ? "bg-primary/15 text-primary"
              : "bg-status-warn/15 text-status-warn"
            const badgeLabel = isCritical ? "Kritis" : isInfo ? "Info" : "Peringatan"

            return (
              <div key={idx} className={`rounded-2xl border px-4 py-3 transition-opacity ${colorWrap} ${isRead ? "opacity-50" : ""}`}>
                {/* Line 1: icon + label + badge + time */}
                <div className="flex items-center gap-2 min-w-0">
                  <meta.Icon size={14} className={`flex-shrink-0 ${colorIcon}`} />
                  <span className={`text-sm font-semibold truncate flex-1 ${colorIcon}`}>{meta.label}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${colorBadge}`}>
                    {badgeLabel}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">{formatTimeAgo(a.detectedAt)}</span>
                </div>
                <p className="text-xs text-foreground mt-1 leading-snug">{a.message}</p>
              </div>
            )
          })}
        </div>
      )}
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
