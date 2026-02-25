"use client"

import { useEffect, useState } from "react"
import { CheckCircle, Zap, ArrowLeft, Droplets, Smartphone, CreditCard, Building } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"

interface TokenPurchaseProps {
  unitId: string
  onBack?: () => void
}

const TOKEN_PACKAGES = [
  { id: 1, nominal: 50000, kwh: 34.6, popular: false },
  { id: 2, nominal: 100000, kwh: 69.2, popular: true },
  { id: 3, nominal: 200000, kwh: 138.4, popular: false },
  { id: 4, nominal: 500000, kwh: 346.1, popular: false },
]

const PAYMENT_METHODS = [
  { id: "qris", name: "QRIS", icon: <Smartphone size={24} /> },
  { id: "transfer", name: "Transfer Bank", icon: <Building size={24} /> },
  { id: "ewallet", name: "E-Wallet", icon: <CreditCard size={24} /> },
] as const

export default function TokenPurchase({ unitId, onBack }: TokenPurchaseProps) {
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null)
  const [utilityType, setUtilityType] = useState<"electricity" | "water">("electricity")
  const [customAmount, setCustomAmount] = useState("")
  const [selectedMethod, setSelectedMethod] = useState<(typeof PAYMENT_METHODS)[number]["id"] | null>(null)
  const [loading, setLoading] = useState(false)
  const [transactionId, setTransactionId] = useState("")
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [currentBalance, setCurrentBalance] = useState("0 KWh")

  useEffect(() => {
    let active = true

    const loadSummary = async () => {
      try {
        const data = await api.getDashboard(unitId)
        if (!active) return
        const kwh = data.summary.remainingEstimate.kwh
        setCurrentBalance(`${kwh.toFixed(2)} KWh`)
      } catch {
        if (!active) return
        setCurrentBalance("N/A")
      }
    }

    void loadSummary()

    return () => {
      active = false
    }
  }, [unitId])

  const handleSelectPackage = (id: number) => {
    setSelectedPackage(id)
    setCustomAmount("")
    setErrorMessage("")
  }

  const handleCustomAmount = (amount: string) => {
    setCustomAmount(amount)
    setSelectedPackage(null)
    setErrorMessage("")
  }

  const selectedAmount = selectedPackage
    ? TOKEN_PACKAGES.find((p) => p.id === selectedPackage)?.nominal ?? 0
    : Number(customAmount || 0)

  const handlePayment = async () => {
    if (!selectedMethod || selectedAmount < 1000) return

    setLoading(true)
    setErrorMessage("")

    try {
      const initiated = await api.initiateTopup(unitId, selectedAmount, selectedMethod)
      const confirmed = await api.autoConfirmTopup(unitId, initiated.transactionId)

      setTransactionId(confirmed.id)
      setIsSuccess(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Top-up gagal diproses"
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (onBack) onBack()
  }

  if (isSuccess && transactionId) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 space-y-6">
        <div className="bg-primary/10 p-6 rounded-full animate-in zoom-in duration-300">
          <CheckCircle size={64} className="text-primary" />
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Pembayaran Berhasil</h1>
          <p className="text-muted-foreground">Token berhasil dikonfirmasi otomatis oleh gateway callback.</p>
        </div>

        <Card className="w-full max-w-sm bg-muted/30 p-6 space-y-4">
          <div className="flex justify-between items-center pb-4 border-b">
            <span className="text-muted-foreground">ID Transaksi</span>
            <span className="font-mono font-medium">{transactionId}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Nominal</span>
            <span className="font-semibold">Rp {selectedAmount.toLocaleString("id-ID")}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Metode</span>
            <span className="font-medium text-right">{PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name}</span>
          </div>
        </Card>

        <div className="w-full max-w-sm space-y-3 pt-8">
          <Button
            className="w-full bg-primary hover:bg-primary/90 h-12 text-base rounded-xl"
            onClick={() => setIsSuccess(false)}
          >
            Beli Lagi
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-base rounded-xl border-primary text-primary hover:bg-primary/5"
            onClick={handleBack}
          >
            Kembali ke Beranda
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="flex items-center gap-4 p-4 sticky top-0 bg-background z-10">
        <button onClick={handleBack} className="p-2 hover:bg-muted rounded-full">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">Beli Token</h1>
      </div>

      <div className="px-5 space-y-6">
        <div className="bg-muted p-1 rounded-2xl flex relative">
          <button
            onClick={() => setUtilityType("electricity")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
              utilityType === "electricity"
                ? "bg-white text-teal-700 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap size={18} className={utilityType === "electricity" ? "fill-teal-700 text-teal-700" : ""} />
            Listrik
          </button>
          <button
            onClick={() => setUtilityType("water")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
              utilityType === "water"
                ? "bg-white text-teal-700 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Droplets size={18} className={utilityType === "water" ? "fill-teal-700 text-teal-700" : ""} />
            Air
          </button>
        </div>

        <div className="bg-teal-50/50 dark:bg-teal-950/20 rounded-3xl p-6 text-center space-y-1">
          <p className="text-sm text-muted-foreground font-medium">Sisa Saldo Saat Ini</p>
          <h2 className="text-4xl font-bold text-teal-800 dark:text-teal-400 font-mono tracking-tight">{currentBalance}</h2>
          <p className="text-xs text-muted-foreground italic">Unit {unitId}</p>
        </div>

        <div className="space-y-3">
          <h3 className="font-bold text-base">Pilih Paket</h3>
          <div className="grid grid-cols-2 gap-3">
            {TOKEN_PACKAGES.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => handleSelectPackage(pkg.id)}
                className={`relative p-4 rounded-2xl border transition-all text-left space-y-1 ${
                  selectedPackage === pkg.id
                    ? "border-teal-600 bg-teal-50/50 dark:bg-teal-950/20 ring-1 ring-teal-600"
                    : "border-border hover:border-teal-200 bg-card"
                }`}
              >
                {pkg.popular && (
                  <span className="absolute top-0 right-0 bg-teal-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg rounded-tr-lg">
                    POPULER
                  </span>
                )}
                <p className="font-bold text-lg text-foreground">Rp {pkg.nominal.toLocaleString("id-ID")}</p>
                <p className="text-xs text-muted-foreground">
                  sekitar {pkg.kwh} {utilityType === "electricity" ? "KWh" : "m3"}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-bold text-base">Jumlah Lainnya</h3>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">Rp</span>
            <Input
              type="number"
              placeholder="Minimal 20,000"
              value={customAmount}
              onChange={(e) => handleCustomAmount(e.target.value)}
              className="pl-12 h-14 rounded-xl text-lg bg-muted/30 border-none shadow-none focus-visible:ring-1 focus-visible:ring-teal-600"
            />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-bold text-base">Metode Pembayaran</h3>
          <div className="space-y-3">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.id}
                onClick={() => {
                  setSelectedMethod(method.id)
                  setErrorMessage("")
                }}
                className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between bg-card ${
                  selectedMethod === method.id
                    ? "border-teal-600 ring-1 ring-teal-600"
                    : "border-border hover:border-teal-200"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="text-muted-foreground">{method.icon}</div>
                  <span className="font-bold text-sm">{method.name}</span>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedMethod === method.id ? "border-teal-600 bg-teal-600" : "border-muted-foreground/30"
                  }`}
                >
                  {selectedMethod === method.id && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-5 bg-background border-t">
        <Button
          onClick={handlePayment}
          disabled={(!selectedPackage && !customAmount) || !selectedMethod || loading}
          className="w-full bg-[#8EB8B3] hover:bg-[#7DA09C] text-white font-bold h-14 rounded-xl text-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Memproses..." : "Lanjutkan Pembayaran"}
        </Button>
      </div>
    </div>
  )
}
