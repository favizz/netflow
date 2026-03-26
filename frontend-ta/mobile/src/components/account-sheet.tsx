"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { LogOut, Moon, Sun, Zap, Building2 } from "lucide-react"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, type UnitSummary } from "@/lib/api"
import { cta } from "@/lib/styles"

interface AccountSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  unitId: string
  relayStatus: boolean
  availableUnits: UnitSummary[]
  onSelectUnit: (id: number) => Promise<void>
  onLogout: () => void
}

export default function AccountSheet({
  open,
  onOpenChange,
  unitId,
  relayStatus: initialRelay,
  availableUnits,
  onSelectUnit,
  onLogout,
}: AccountSheetProps) {
  const { theme, setTheme } = useTheme()
  const [relay, setRelay] = useState(initialRelay)
  const [relayLoading, setRelayLoading] = useState(false)

  const handleRelayToggle = async (on: boolean) => {
    setRelayLoading(true)
    try {
      const res = await api.setRelay(unitId, on)
      setRelay(res.relayStatus)
      toast.success(res.relayStatus ? "Listrik dinyalakan" : "Listrik dimatikan")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah status relay")
    } finally {
      setRelayLoading(false)
    }
  }

  const handleUnitChange = async (val: string) => {
    const unit = availableUnits.find((u) => u.unitNo === val)
    if (!unit) return
    try {
      await onSelectUnit(unit.id)
      onOpenChange(false)
    } catch {
      toast.error("Gagal mengganti unit")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl px-6 pb-10 pt-4 max-h-[85vh] overflow-y-auto">
        <div className="mx-auto w-10 h-1 bg-muted-foreground/20 rounded-full mb-6" />

        <SheetHeader className="text-left mb-6">
          <SheetTitle className="text-xl font-bold">Akun Saya</SheetTitle>
        </SheetHeader>

        {/* Unit selector */}
        {availableUnits.length > 1 && (
          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-2 font-medium">Unit Aktif</p>
            <Select value={unitId} onValueChange={(val) => void handleUnitChange(val)}>
              <SelectTrigger className="w-full h-12 rounded-xl border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-muted-foreground" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {availableUnits.map((u) => (
                  <SelectItem key={u.id} value={u.unitNo}>
                    Unit {u.unitNo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {availableUnits.length <= 1 && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-muted/30 rounded-2xl">
            <Building2 size={20} className="text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Unit Aktif</p>
              <p className="font-semibold text-foreground">{unitId}</p>
            </div>
          </div>
        )}

        <Separator className="mb-6" />

        {/* Relay control */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Zap size={18} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Aliran Listrik</p>
              <p className="text-xs text-muted-foreground">{relay ? "Aktif — aliran berjalan" : "Dimatikan"}</p>
            </div>
          </div>
          <Switch
            checked={relay}
            disabled={relayLoading}
            onCheckedChange={(val) => void handleRelayToggle(val)}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        <Separator className="mb-6" />

        {/* Dark/light mode */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-muted">
              {theme === "dark" ? <Moon size={18} className="text-foreground" /> : <Sun size={18} className="text-foreground" />}
            </div>
            <div>
              <p className="font-semibold text-foreground">Tampilan</p>
              <p className="text-xs text-muted-foreground">{theme === "dark" ? "Mode Gelap" : theme === "light" ? "Mode Terang" : "Ikuti Sistem"}</p>
            </div>
          </div>
          <Switch
            checked={theme === "dark"}
            onCheckedChange={(on) => setTheme(on ? "dark" : "light")}
          />
        </div>

        {/* Logout */}
        <Button
          variant="outline"
          className={`${cta.secondary} border-destructive/40 text-destructive hover:bg-destructive/5`}
          onClick={onLogout}
        >
          <LogOut size={18} className="mr-2" />
          Keluar
        </Button>
      </SheetContent>
    </Sheet>
  )
}
