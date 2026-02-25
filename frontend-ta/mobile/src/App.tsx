"use client"

import { useState, useEffect } from "react"
import { Home, ShoppingCart, TrendingUp, LogOut } from "lucide-react"
import Dashboard from "@/components/dashboard"
import TokenPurchase from "@/components/token-purchase"
import ConsumptionHistory from "@/components/consumption-history"
import LoginForm from "@/components/login-form"
import AdminView from "@/components/admin-view"
import { useAppState } from "@/hooks/use-app-state"

export default function Page() {
  const [currentPage, setCurrentPage] = useState<"login" | "home" | "purchase" | "history" | "admin">("login")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userUnit, setUserUnit] = useState("")
  const [unreadAlerts, setUnreadAlerts] = useState(1)
  const [showTechView, setShowTechView] = useState(false)

  const { utility, devices, addTransaction } = useAppState()

  useEffect(() => {
    if (!isLoggedIn) return

    const alertTimer = setTimeout(() => {
      setUnreadAlerts((prev) => Math.min(prev + 1, 5))
    }, 15000)

    return () => clearTimeout(alertTimer)
  }, [isLoggedIn])

  const handleLogin = () => {
    setUserUnit("A-2401")
    setIsLoggedIn(true)
    setCurrentPage("home")
    setUnreadAlerts(1)
    setShowTechView(false)
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setCurrentPage("login")
    setUserUnit("")
    setUnreadAlerts(0)
    setShowTechView(false)
  }

  const handleDeviceToggle = (deviceId: string, newStatus: "on" | "off") => {
    // Mock device toggle - in real system would call API
    console.log("[v0] Device toggled:", deviceId, newStatus)
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
            onClick={handleLogout}
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
      {/* Main Content */}
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
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors relative ${currentPage === "home" ? "text-primary bg-muted" : "text-muted-foreground hover:text-primary"
            }`}
        >
          <Home size={24} />
          <span className="text-xs font-medium">Beranda</span>
        </button>
        <button
          onClick={() => setCurrentPage("purchase")}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors relative ${currentPage === "purchase" ? "text-primary bg-muted" : "text-muted-foreground hover:text-primary"
            }`}
        >
          <ShoppingCart size={24} />
          <span className="text-xs font-medium">Beli Token</span>
        </button>
        <button
          onClick={() => setCurrentPage("history")}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors relative ${currentPage === "history" ? "text-primary bg-muted" : "text-muted-foreground hover:text-primary"
            }`}
        >
          <TrendingUp size={24} />
          <span className="text-xs font-medium">Riwayat</span>
        </button>
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-muted-foreground hover:text-destructive transition-colors relative"
        >
          <div className="relative">
            <LogOut size={24} />
            {unreadAlerts > 0 && (
              <div className="absolute -top-1 -right-1 bg-destructive text-xs text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {unreadAlerts}
              </div>
            )}
          </div>
          <span className="text-xs font-medium">Keluar</span>
        </button>
      </nav>
    </div>
  )
}
