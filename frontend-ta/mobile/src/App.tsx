"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Home, ShoppingCart, LogOut, Zap, Sun, Moon, Bell, AlertTriangle, AlertCircle, Info } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import Dashboard from "@/components/dashboard"
import TokenPurchase from "@/components/token-purchase"
import LoginForm from "@/components/login-form"
import { api, authStore, type NotificationItem, type UnitSummary } from "@/lib/api"
import { interactive, type Page } from "@/lib/styles"

type MainPage = Extract<Page, "home" | "purchase">

export default function App() {
  const { theme, setTheme } = useTheme()
  const [currentPage, setCurrentPage] = useState<MainPage>("home")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userUnit, setUserUnit] = useState("")
  const [availableUnits, setAvailableUnits] = useState<UnitSummary[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notifOpen, setNotifOpen] = useState(false)

  useEffect(() => {
    let active = true
    const bootstrap = async () => {
      if (!authStore.getToken()) return
      try {
        const me = await api.me()
        if (!active) return
        setAvailableUnits(me.units)
        if (me.unitNo) {
          setUserUnit(me.unitNo)
          setIsLoggedIn(true)
        } else if (me.units.length > 0) {
          const selected = await api.selectUnit(me.units[0].id)
          if (!active) return
          setUserUnit(selected.unitNo!)
          setAvailableUnits(selected.units)
          setIsLoggedIn(true)
        } else {
          authStore.clear()
        }
      } catch {
        if (!active) return
        authStore.clear()
      }
    }
    void bootstrap()
    return () => { active = false }
  }, [])

  // Poll notifications every 30 s
  useEffect(() => {
    if (!isLoggedIn || !userUnit) return
    let active = true
    const load = async () => {
      try {
        const n = await api.getNotifications(userUnit)
        if (active) setNotifications(n)
      } catch {
        if (active) setNotifications([])
      }
    }
    void load()
    const interval = setInterval(() => void load(), 30_000)
    return () => { active = false; clearInterval(interval) }
  }, [isLoggedIn, userUnit])

  const alertCount = notifications.filter((n) => n.type !== "info").length

  const applyLoginResult = async (result: { unitNo: string | null; units: UnitSummary[] }) => {
    setAvailableUnits(result.units)
    if (result.unitNo) {
      setUserUnit(result.unitNo)
      setIsLoggedIn(true)
    } else if (result.units.length > 0) {
      const selected = await api.selectUnit(result.units[0].id)
      setUserUnit(selected.unitNo!)
      setAvailableUnits(selected.units)
      setIsLoggedIn(true)
    }
  }

  const handleGoogleLogin = async (credential: string) => {
    await applyLoginResult(await api.googleLogin(credential))
  }

  const handleDevLogin = async (email: string) => {
    await applyLoginResult(await api.devLogin(email))
  }

  const handleSelectUnit = async (unitId: number) => {
    const result = await api.selectUnit(unitId)
    if (!result.unitNo) throw new Error("Unit selection failed")
    setUserUnit(result.unitNo)
    setAvailableUnits(result.units)
    setCurrentPage("home")
  }

  const handleLogout = async () => {
    await api.logout()
    setIsLoggedIn(false)
    setCurrentPage("home")
    setUserUnit("")
    setAvailableUnits([])
    setNotifications([])
  }

  if (!isLoggedIn) {
    return <LoginForm onGoogleLogin={handleGoogleLogin} onDevLogin={handleDevLogin} />
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border flex items-center justify-between px-5 h-14">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
            <Zap size={16} />
          </div>
          <span className="font-bold text-base text-foreground tracking-tight">Smart Meter</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Notification bell */}
          <button
            onClick={() => setNotifOpen(true)}
            className={`${interactive.ghost} relative text-muted-foreground`}
            aria-label="Notifikasi"
          >
            <Bell size={20} />
            {alertCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-status-critical text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {Math.min(alertCount, 9)}
              </span>
            )}
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`${interactive.ghost} text-muted-foreground`}
            aria-label="Ganti tema"
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* Logout */}
          <button
            onClick={() => void handleLogout()}
            className={`${interactive.ghost} text-muted-foreground hover:text-destructive`}
            aria-label="Keluar"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {currentPage === "home" && (
          <Dashboard
            unitId={userUnit}
            availableUnits={availableUnits}
            onSelectUnit={handleSelectUnit}
          />
        )}
        {currentPage === "purchase" && (
          <TokenPurchase unitId={userUnit} onBack={() => setCurrentPage("home")} />
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border flex z-20 h-16 sm:h-20">
        <button
          onClick={() => setCurrentPage("home")}
          className={`${interactive.navItem} ${currentPage === "home" ? interactive.navActive : interactive.navInactive}`}
        >
          <Home size={22} />
          <span className="text-xs font-medium">Beranda</span>
        </button>
        <button
          onClick={() => setCurrentPage("purchase")}
          className={`${interactive.navItem} ${currentPage === "purchase" ? interactive.navActive : interactive.navInactive}`}
        >
          <ShoppingCart size={22} />
          <span className="text-xs font-medium">Beli Token</span>
        </button>
      </nav>

      {/* Notification sheet */}
      <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-6 pb-10 pt-4 max-h-[70vh] overflow-y-auto">
          <div className="mx-auto w-10 h-1 bg-muted-foreground/20 rounded-full mb-5" />
          <SheetHeader className="text-left mb-4">
            <SheetTitle className="text-lg font-bold flex items-center gap-2">
              <Bell size={18} className="text-primary" />
              Notifikasi
              {alertCount > 0 && (
                <span className="text-xs font-bold bg-status-critical/10 text-status-critical px-2 py-0.5 rounded-full">
                  {alertCount} peringatan
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Tidak ada notifikasi</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((n, idx) => {
                const Icon = n.type === "warning" ? AlertTriangle : n.type === "error" ? AlertCircle : Info
                const styles = {
                  warning: { wrap: "bg-status-warn/10 border-status-warn/20",   icon: "text-status-warn",     text: "text-status-warn" },
                  error:   { wrap: "bg-status-critical/10 border-status-critical/20", icon: "text-status-critical", text: "text-status-critical" },
                  info:    { wrap: "bg-primary/5 border-primary/10",             icon: "text-primary",         text: "text-foreground" },
                }
                const s = styles[n.type]
                const timeAgo = formatTimeAgo(n.timestamp)
                return (
                  <div key={idx} className={`flex gap-3 p-3 rounded-xl border ${s.wrap}`}>
                    <Icon size={18} className={`flex-shrink-0 mt-0.5 ${s.icon}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${s.text}`}>{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{timeAgo}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>
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
