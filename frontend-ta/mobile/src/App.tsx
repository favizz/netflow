"use client"

import { useEffect, useState } from "react"
import { Home, ShoppingCart, TrendingUp, LogOut } from "lucide-react"
import Dashboard from "@/components/dashboard"
import TokenPurchase from "@/components/token-purchase"
import ConsumptionHistory from "@/components/consumption-history"
import LoginForm from "@/components/login-form"
import AdminView from "@/components/admin-view"
import { useAppState } from "@/hooks/use-app-state"
import { api, authStore } from "@/lib/api"

export default function Page() {
  const [currentPage, setCurrentPage] = useState<"login" | "home" | "purchase" | "history" | "admin">("login")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userUnit, setUserUnit] = useState("")
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [showTechView, setShowTechView] = useState(false)

  const { utility, devices } = useAppState()

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      if (!authStore.getToken()) return

      try {
        const me = await api.me()
        if (!active) return
        setUserUnit(me.unitNo)
        setIsLoggedIn(true)
        setCurrentPage("home")
      } catch {
        if (!active) return
        authStore.clear()
      }
    }

    void bootstrap()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isLoggedIn || !userUnit) return

    let active = true

    const loadNotifications = async () => {
      try {
        const notifications = await api.getNotifications(userUnit)
        if (!active) return
        const count = notifications.filter((n) => n.type !== "info").length
        setUnreadAlerts(count)
      } catch {
        if (!active) return
        setUnreadAlerts(0)
      }
    }

    void loadNotifications()
    const interval = setInterval(() => void loadNotifications(), 30000)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [isLoggedIn, userUnit])

  const handleLogin = async ({ unitNo, pin }: { unitNo: string; pin: string }) => {
    const result = await api.login(unitNo, pin)
    setUserUnit(result.unitNo)
    setIsLoggedIn(true)
    setCurrentPage("home")
    setShowTechView(false)
  }

  const handleLogout = async () => {
    await api.logout()
    setIsLoggedIn(false)
    setCurrentPage("login")
    setUserUnit("")
    setUnreadAlerts(0)
    setShowTechView(false)
  }

  const handleDeviceToggle = (deviceId: string, newStatus: "on" | "off") => {
    console.log("Device toggle requested:", deviceId, newStatus)
  }

  if (!isLoggedIn) {
    return <LoginForm onLogin={handleLogin} />
  }

  if (showTechView) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <main className="flex-1 overflow-y-auto pb-20">
          <AdminView
            devices={devices}
            unitId={userUnit}
            lastUpdated={utility.lastUpdated}
            onDeviceToggle={handleDeviceToggle}
          />
        </main>

        <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around items-center h-16 sm:h-20">
          <button
            onClick={() => setShowTechView(false)}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors text-primary bg-muted"
          >
            <Home size={24} />
            <span className="text-xs font-medium">Beranda</span>
          </button>
          <button
            onClick={() => void handleLogout()}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut size={24} />
            <span className="text-xs font-medium">Keluar</span>
          </button>
        </nav>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <main className="flex-1 overflow-y-auto pb-20">
        {currentPage === "home" && (
          <Dashboard
            unitId={userUnit}
            onUnitChange={setUserUnit}
            showTechView={showTechView}
            onShowTechView={setShowTechView}
          />
        )}
        {currentPage === "purchase" && <TokenPurchase unitId={userUnit} onBack={() => setCurrentPage("home")} />}
        {currentPage === "history" && <ConsumptionHistory unitId={userUnit} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around items-center h-16 sm:h-20">
        <button
          onClick={() => setCurrentPage("home")}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors relative ${currentPage === "home" ? "text-primary bg-muted" : "text-muted-foreground hover:text-primary"}`}
        >
          <Home size={24} />
          <span className="text-xs font-medium">Beranda</span>
        </button>
        <button
          onClick={() => setCurrentPage("purchase")}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors relative ${currentPage === "purchase" ? "text-primary bg-muted" : "text-muted-foreground hover:text-primary"}`}
        >
          <ShoppingCart size={24} />
          <span className="text-xs font-medium">Beli Token</span>
        </button>
        <button
          onClick={() => setCurrentPage("history")}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors relative ${currentPage === "history" ? "text-primary bg-muted" : "text-muted-foreground hover:text-primary"}`}
        >
          <TrendingUp size={24} />
          <span className="text-xs font-medium">Riwayat</span>
        </button>
        <button
          onClick={() => void handleLogout()}
          className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-muted-foreground hover:text-destructive transition-colors relative"
        >
          <div className="relative">
            <LogOut size={24} />
            {unreadAlerts > 0 && (
              <div className="absolute -top-1 -right-1 bg-destructive text-xs text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {Math.min(unreadAlerts, 9)}
              </div>
            )}
          </div>
          <span className="text-xs font-medium">Keluar</span>
        </button>
      </nav>
    </div>
  )
}
