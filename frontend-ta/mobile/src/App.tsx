"use client"

import { useEffect, useState } from "react"
import { Home, ShoppingCart, TrendingUp, LogOut, Building2 } from "lucide-react"
import Dashboard from "@/components/dashboard"
import TokenPurchase from "@/components/token-purchase"
import ConsumptionHistory from "@/components/consumption-history"
import LoginForm from "@/components/login-form"
import AdminView from "@/components/admin-view"
import { useAppState } from "@/hooks/use-app-state"
import { api, authStore, type UnitSummary } from "@/lib/api"

export default function Page() {
  const [currentPage, setCurrentPage] = useState<"login" | "home" | "purchase" | "history" | "admin">("login")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userUnit, setUserUnit] = useState("")
  const [availableUnits, setAvailableUnits] = useState<UnitSummary[]>([])
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [showTechView, setShowTechView] = useState(false)
  const [isUnitPickerOpen, setIsUnitPickerOpen] = useState(false)

  const { utility, devices } = useAppState()

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
          setCurrentPage("home")
        } else if (me.units.length > 0) {
          // Auto-select first unit
          const selected = await api.selectUnit(me.units[0].id)
          if (!active) return
          setUserUnit(selected.unitNo!)
          setAvailableUnits(selected.units)
          setIsLoggedIn(true)
          setCurrentPage("home")
        } else {
          // No units assigned
          authStore.clear()
        }
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

  const applyLoginResult = async (result: { unitNo: string | null; units: { id: number; unitNo: string }[] }) => {
    setAvailableUnits(result.units)
    if (result.unitNo) {
      setUserUnit(result.unitNo)
      setIsLoggedIn(true)
      setCurrentPage("home")
    } else if (result.units.length > 0) {
      // Auto-select first unit
      const selected = await api.selectUnit(result.units[0].id)
      setUserUnit(selected.unitNo!)
      setAvailableUnits(selected.units)
      setIsLoggedIn(true)
      setCurrentPage("home")
    }
    setShowTechView(false)
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
    setIsLoggedIn(true)
    setCurrentPage("home")
    setShowTechView(false)
    setIsUnitPickerOpen(false)
  }

  const handleLogout = async () => {
    await api.logout()
    setIsLoggedIn(false)
    setCurrentPage("login")
    setUserUnit("")
    setAvailableUnits([])
    setUnreadAlerts(0)
    setShowTechView(false)
  }

  const handleDeviceToggle = (deviceId: string, newStatus: "on" | "off") => {
    console.log("Device toggle requested:", deviceId, newStatus)
  }

  if (currentPage === "login") {
    return <LoginForm onGoogleLogin={handleGoogleLogin} onDevLogin={handleDevLogin} />
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
          {availableUnits.length > 1 && (
            <button
              onClick={() => setIsUnitPickerOpen(true)}
              className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-muted-foreground hover:text-primary transition-colors"
            >
              <Building2 size={24} />
              <span className="text-xs font-medium">{userUnit}</span>
            </button>
          )}
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
        {availableUnits.length > 1 && (
          <button
            onClick={() => setIsUnitPickerOpen(true)}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors relative ${isUnitPickerOpen ? "text-primary bg-muted" : "text-muted-foreground hover:text-primary"}`}
          >
            <Building2 size={24} />
            <span className="text-xs font-medium">{userUnit}</span>
          </button>
        )}
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

      {isUnitPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsUnitPickerOpen(false)} />
          <div className="relative w-full bg-card rounded-t-2xl p-6 space-y-3 border-t border-border">
            <h3 className="text-base font-semibold text-center mb-4">Pilih Unit</h3>
            {availableUnits.map((unit) => (
              <button
                key={unit.id}
                onClick={() => void handleSelectUnit(unit.id)}
                className={`w-full h-12 rounded-lg border text-sm font-medium transition-colors ${
                  unit.unitNo === userUnit
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}
              >
                {unit.unitNo}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
