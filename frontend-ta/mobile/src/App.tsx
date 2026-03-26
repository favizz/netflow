"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import {
  Home, ShoppingCart, LogOut, Zap, Sun, Moon,
  Bell, AlertTriangle, AlertCircle, Info,
} from "lucide-react"
import Dashboard from "@/components/dashboard"
import TokenPurchase from "@/components/token-purchase"
import LoginForm from "@/components/login-form"
import { api, authStore, type NotificationItem, type UnitSummary } from "@/lib/api"
import { interactive, type Page } from "@/lib/styles"

export default function App() {
  const { theme, setTheme } = useTheme()
  const [currentPage, setCurrentPage] = useState<Page>("home")
  const [isLoggedIn, setIsLoggedIn]   = useState(false)
  const [userUnit, setUserUnit]       = useState("")
  const [availableUnits, setAvailableUnits]   = useState<UnitSummary[]>([])
  const [notifications, setNotifications]     = useState<NotificationItem[]>([])

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

  // ── Poll notifications every 30 s ─────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn || !userUnit) return
    let active = true
    const load = async () => {
      try { const n = await api.getNotifications(userUnit); if (active) setNotifications(n) }
      catch { if (active) setNotifications([]) }
    }
    void load()
    const id = setInterval(() => void load(), 30_000)
    return () => { active = false; clearInterval(id) }
  }, [isLoggedIn, userUnit])

  const alertCount = notifications.filter((n) => n.type !== "info").length

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

  const handleGoogleLogin  = async (c: string) => { await applyLoginResult(await api.googleLogin(c)) }
  const handleDevLogin     = async (e: string) => { await applyLoginResult(await api.devLogin(e)) }
  const handleSelectUnit   = async (unitId: number) => {
    const r = await api.selectUnit(unitId)
    if (!r.unitNo) throw new Error("Unit selection failed")
    setUserUnit(r.unitNo); setAvailableUnits(r.units); setCurrentPage("home")
  }
  const handleLogout = async () => {
    await api.logout()
    setIsLoggedIn(false); setCurrentPage("home")
    setUserUnit(""); setAvailableUnits([]); setNotifications([])
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
          <NotificationsPage notifications={notifications} />
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
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-status-critical text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
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
function NotificationsPage({ notifications }: { notifications: NotificationItem[] }) {
  const alertCount = notifications.filter((n) => n.type !== "info").length

  return (
    <div className="p-5 space-y-4">
      {/* Heading */}
      <div className="flex items-center gap-2 pt-1">
        <Bell size={20} className="text-primary" />
        <h1 className="text-xl font-bold text-foreground">Notifikasi</h1>
        {alertCount > 0 && (
          <span className="text-xs font-bold bg-status-critical/10 text-status-critical px-2 py-0.5 rounded-full">
            {alertCount} peringatan
          </span>
        )}
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Bell size={40} className="opacity-20" />
          <p className="text-sm">Tidak ada notifikasi</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n, idx) => {
            const Icon = n.type === "warning" ? AlertTriangle : n.type === "error" ? AlertCircle : Info
            const s = {
              warning: { wrap: "bg-status-warn/10 border-status-warn/20",         icon: "text-status-warn",     text: "text-status-warn"     },
              error:   { wrap: "bg-status-critical/10 border-status-critical/20", icon: "text-status-critical", text: "text-status-critical" },
              info:    { wrap: "bg-primary/5 border-primary/10",                  icon: "text-primary",         text: "text-foreground"       },
            }[n.type]
            return (
              <div key={idx} className={`flex gap-3 p-4 rounded-2xl border ${s.wrap}`}>
                <Icon size={18} className={`flex-shrink-0 mt-0.5 ${s.icon}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${s.text}`}>{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatTimeAgo(n.timestamp)}</p>
                </div>
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
