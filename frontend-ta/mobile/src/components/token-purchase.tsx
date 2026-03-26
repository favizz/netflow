"use client"

import { useEffect, useState } from "react"
import { CheckCircle, Zap, ArrowLeft, Droplets, QrCode, Building2, Wallet, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { cta, interactive, TOKEN_AMOUNTS, POPULAR_IDX, DEFAULT_TARIFF, type PaymentMethod } from "@/lib/styles"

// ── Payment method catalogue ──────────────────────────────────────────────────

interface PaymentOption {
  id: string
  label: string
  sublabel: string
  method: PaymentMethod
  icon: React.ReactNode
  subOptions?: string[]
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: "qris",
    label: "QRIS",
    sublabel: "Scan dengan semua m-banking & e-wallet",
    method: "qris",
    icon: <QrCode size={22} />,
  },
  {
    id: "va-bca",
    label: "BCA Virtual Account",
    sublabel: "Transfer via m-BCA / ATM BCA",
    method: "transfer",
    icon: <Building2 size={22} />,
  },
  {
    id: "va-bni",
    label: "BNI Virtual Account",
    sublabel: "Transfer via BNI Mobile / ATM BNI",
    method: "transfer",
    icon: <Building2 size={22} />,
  },
  {
    id: "va-bri",
    label: "BRI Virtual Account",
    sublabel: "Transfer via BRImo / ATM BRI",
    method: "transfer",
    icon: <Building2 size={22} />,
  },
  {
    id: "va-mandiri",
    label: "Mandiri Virtual Account",
    sublabel: "Transfer via Livin' / ATM Mandiri",
    method: "transfer",
    icon: <Building2 size={22} />,
  },
  {
    id: "gopay",
    label: "GoPay",
    sublabel: "Bayar langsung via aplikasi Gojek",
    method: "ewallet",
    icon: <Wallet size={22} />,
  },
  {
    id: "ovo",
    label: "OVO",
    sublabel: "Bayar langsung via aplikasi OVO",
    method: "ewallet",
    icon: <Wallet size={22} />,
  },
  {
    id: "dana",
    label: "Dana",
    sublabel: "Bayar langsung via aplikasi Dana",
    method: "ewallet",
    icon: <Wallet size={22} />,
  },
  {
    id: "shopeepay",
    label: "ShopeePay",
    sublabel: "Bayar langsung via aplikasi Shopee",
    method: "ewallet",
    icon: <Wallet size={22} />,
  },
]

const VA_STEPS: Record<string, string[]> = {
  "va-bca":     ["Buka aplikasi m-BCA atau m-Banking BCA", "Pilih Transfer → BCA Virtual Account", "Masukkan nomor Virtual Account di bawah", "Masukkan nominal yang tertera, lalu konfirmasi"],
  "va-bni":     ["Buka aplikasi BNI Mobile Banking", "Pilih Transfer → Virtual Account Billing", "Masukkan nomor Virtual Account di bawah", "Konfirmasi pembayaran sesuai nominal"],
  "va-bri":     ["Buka aplikasi BRImo", "Pilih BRIVA", "Masukkan nomor Virtual Account di bawah", "Cek nominal lalu konfirmasi"],
  "va-mandiri": ["Buka Livin' by Mandiri", "Pilih Bayar → Multi Payment", "Masukkan kode perusahaan dan nomor VA", "Konfirmasi sesuai nominal yang tertera"],
}

// ── Component ─────────────────────────────────────────────────────────────────

type Step = "amount" | "method" | "instruction" | "success"

interface TokenPurchaseProps {
  unitId: string
  onBack?: () => void
}

export default function TokenPurchase({ unitId, onBack }: TokenPurchaseProps) {
  const [step, setStep] = useState<Step>("amount")
  const [utilityType, setUtilityType] = useState<"electricity" | "water">("electricity")
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState("")
  const [selectedOption, setSelectedOption] = useState<PaymentOption | null>(null)
  const [energyTariff, setEnergyTariff] = useState(DEFAULT_TARIFF.kwh)
  const [currentBalance, setCurrentBalance] = useState("0 KWh")
  const [loading, setLoading] = useState(false)
  const [initResult, setInitResult] = useState<{ transactionId: string; gatewayReference: string } | null>(null)
  const [transactionId, setTransactionId] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    const loadSummary = async () => {
      try {
        const data = await api.getDashboard(unitId)
        if (!active) return
        setCurrentBalance(`${data.summary.remainingEstimate.kwh.toFixed(2)} KWh`)
        setEnergyTariff(data.summary.energyTariff)
      } catch {
        if (!active) return
        setCurrentBalance("N/A")
      }
    }
    void loadSummary()
    return () => { active = false }
  }, [unitId])

  const selectedAmount = selectedPackage
    ? TOKEN_AMOUNTS[selectedPackage - 1] ?? 0
    : Number(customAmount || 0)

  // ── Handlers ────────────────────────────────────────────────────────────────

  const goToMethod = () => {
    if (selectedAmount < 1000) {
      toast.error("Nominal minimum Rp 1.000")
      return
    }
    setStep("method")
  }

  const goToInstruction = async () => {
    if (!selectedOption) return
    setLoading(true)
    try {
      const result = await api.initiateTopup(unitId, selectedAmount, selectedOption.method)
      setInitResult({ transactionId: result.transactionId, gatewayReference: result.transactionId.replace("TRX-", "") })
      setStep("instruction")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memulai transaksi")
    } finally {
      setLoading(false)
    }
  }

  const confirmPayment = async () => {
    if (!initResult) return
    setLoading(true)
    try {
      const confirmed = await api.autoConfirmTopup(unitId, initResult.transactionId)
      setTransactionId(confirmed.id)
      setStep("success")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Konfirmasi gagal. Coba lagi.")
    } finally {
      setLoading(false)
    }
  }

  const copyVA = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const restart = () => {
    setStep("amount")
    setSelectedPackage(null)
    setCustomAmount("")
    setSelectedOption(null)
    setInitResult(null)
    setTransactionId("")
  }

  // ── Virtual Account number derived from reference ─────────────────────────
  const vaNumber = initResult ? `8808 ${initResult.gatewayReference.slice(0, 4)} ${initResult.gatewayReference.slice(4, 8) || "0000"} ${initResult.gatewayReference.slice(8, 12) || "0000"}` : ""

  // ── Render ───────────────────────────────────────────────────────────────
  if (step === "success") return <SuccessScreen transactionId={transactionId} amount={selectedAmount} method={selectedOption} onBuyAgain={restart} onBack={onBack} />

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border">
        <button
          onClick={step === "amount" ? onBack : () => setStep(step === "method" ? "amount" : "method")}
          className={interactive.ghost}
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground leading-tight">
            {step === "amount" ? "Beli Token" : step === "method" ? "Pilih Metode" : "Instruksi Pembayaran"}
          </h1>
          <StepIndicator current={step} />
        </div>
      </div>

      <div className="px-5 pt-4 space-y-6">
        {/* ── STEP 1: Amount ──────────────────────────────────────────────── */}
        {step === "amount" && (
          <>
            {/* Utility toggle */}
            <div className={interactive.segRoot}>
              {(["electricity", "water"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setUtilityType(type)}
                  className={`${interactive.segItem} ${utilityType === type ? interactive.segActive : interactive.segInactive}`}
                >
                  {type === "electricity"
                    ? <Zap size={16} className={utilityType === type ? "fill-primary text-primary" : ""} />
                    : <Droplets size={16} className={utilityType === type ? "fill-primary text-primary" : ""} />
                  }
                  {type === "electricity" ? "Listrik" : "Air"}
                </button>
              ))}
            </div>

            {/* Balance card */}
            <div className="bg-primary/5 rounded-3xl p-5 text-center">
              <p className="text-xs text-muted-foreground font-medium mb-1">Sisa Saldo</p>
              <p className="text-4xl font-bold text-primary font-mono tracking-tight">{currentBalance}</p>
              <p className="text-xs text-muted-foreground mt-1">Unit {unitId}</p>
            </div>

            {/* Package grid */}
            <div className="space-y-2">
              <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Pilih Nominal</h3>
              <div className="grid grid-cols-2 gap-3">
                {TOKEN_AMOUNTS.map((nominal, idx) => {
                  const pkgId = idx + 1
                  const isSelected = selectedPackage === pkgId
                  const isPopular = idx === POPULAR_IDX
                  return (
                    <button
                      key={pkgId}
                      onClick={() => { setSelectedPackage(pkgId); setCustomAmount("") }}
                      className={`relative p-4 text-left ${interactive.cardSel} ${isSelected ? interactive.cardSelActive : interactive.cardSelInactive}`}
                    >
                      {isPopular && (
                        <span className="absolute top-0 right-0 bg-primary text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-bl-lg rounded-tr-2xl tracking-wide">
                          TERLARIS
                        </span>
                      )}
                      <p className="font-bold text-base text-foreground">Rp {nominal.toLocaleString("id-ID")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ≈ {(nominal / energyTariff).toFixed(1)} {utilityType === "electricity" ? "KWh" : "m³"}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Custom input */}
            <div className="space-y-2">
              <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Nominal Lainnya</h3>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm">Rp</span>
                <Input
                  type="number"
                  placeholder="Minimal 1.000"
                  value={customAmount}
                  onChange={(e) => { setCustomAmount(e.target.value); setSelectedPackage(null) }}
                  className="pl-12 h-14 rounded-xl text-base bg-muted/30 border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary"
                />
              </div>
            </div>
          </>
        )}

        {/* ── STEP 2: Method ──────────────────────────────────────────────── */}
        {step === "method" && (
          <>
            {/* Amount summary */}
            <div className="flex items-center justify-between bg-muted/40 rounded-2xl px-4 py-3">
              <span className="text-sm text-muted-foreground">Total Pembayaran</span>
              <span className="font-bold text-lg text-foreground">Rp {selectedAmount.toLocaleString("id-ID")}</span>
            </div>

            {/* QRIS */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Bayar Cepat</p>
              {PAYMENT_OPTIONS.filter((o) => o.method === "qris").map((opt) => (
                <MethodRow key={opt.id} option={opt} selected={selectedOption?.id === opt.id} onSelect={setSelectedOption} />
              ))}
            </div>

            {/* Virtual Account */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Transfer Virtual Account</p>
              {PAYMENT_OPTIONS.filter((o) => o.method === "transfer").map((opt) => (
                <MethodRow key={opt.id} option={opt} selected={selectedOption?.id === opt.id} onSelect={setSelectedOption} />
              ))}
            </div>

            {/* E-Wallet */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Dompet Digital</p>
              {PAYMENT_OPTIONS.filter((o) => o.method === "ewallet").map((opt) => (
                <MethodRow key={opt.id} option={opt} selected={selectedOption?.id === opt.id} onSelect={setSelectedOption} />
              ))}
            </div>
          </>
        )}

        {/* ── STEP 3: Instruction ─────────────────────────────────────────── */}
        {step === "instruction" && initResult && selectedOption && (
          <>
            {/* Amount */}
            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground">Total Tagihan</p>
              <p className="text-3xl font-bold text-foreground mt-1">Rp {selectedAmount.toLocaleString("id-ID")}</p>
              <p className="text-xs text-muted-foreground mt-1">Ref: {initResult.transactionId}</p>
            </div>

            {/* QRIS instruction */}
            {selectedOption.method === "qris" && (
              <Card className="p-6 flex flex-col items-center gap-4">
                <p className="text-sm font-semibold text-foreground">Scan kode QRIS berikut</p>
                {/* QR placeholder */}
                <div className="w-48 h-48 bg-white rounded-2xl border-2 border-border flex flex-col items-center justify-center gap-2 shadow-inner">
                  <QrCode size={96} className="text-foreground" strokeWidth={1.2} />
                  <p className="text-[10px] font-mono text-muted-foreground">{initResult.transactionId.slice(-12)}</p>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground">Berlaku selama <span className="font-semibold text-foreground">15 menit</span></p>
                  <p className="text-xs text-muted-foreground">Gunakan m-banking atau dompet digital apapun</p>
                </div>
              </Card>
            )}

            {/* Virtual Account instruction */}
            {selectedOption.method === "transfer" && (
              <Card className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-xl">
                    <Building2 size={20} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{selectedOption.label}</p>
                    <p className="text-xs text-muted-foreground">Berlaku 24 jam</p>
                  </div>
                </div>

                <div className="bg-muted/40 rounded-xl p-4 space-y-1">
                  <p className="text-xs text-muted-foreground">Nomor Virtual Account</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xl font-mono font-bold text-foreground tracking-widest">{vaNumber}</p>
                    <button
                      onClick={() => copyVA(vaNumber)}
                      className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                        copied ? "bg-status-good/10 text-status-good" : "bg-primary/10 text-primary hover:bg-primary/20"
                      }`}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? "Tersalin" : "Salin"}
                    </button>
                  </div>
                </div>

                <ol className="space-y-2">
                  {(VA_STEPS[selectedOption.id] ?? VA_STEPS["va-bca"]).map((step, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            {/* E-Wallet instruction */}
            {selectedOption.method === "ewallet" && (
              <Card className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-xl">
                    <Wallet size={20} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{selectedOption.label}</p>
                    <p className="text-xs text-muted-foreground">Pembayaran dompet digital</p>
                  </div>
                </div>

                <div className="bg-muted/40 rounded-xl p-4 space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Nominal</span>
                    <span className="font-semibold text-foreground">Rp {selectedAmount.toLocaleString("id-ID")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kode Referensi</span>
                    <span className="font-mono text-foreground">{initResult.transactionId.slice(-10)}</span>
                  </div>
                </div>

                <ol className="space-y-2">
                  {[
                    `Buka aplikasi ${selectedOption.label}`,
                    "Pilih menu Bayar / Scan QR",
                    `Masukkan kode referensi atau nominal yang tertera`,
                    "Konfirmasi dan selesaikan pembayaran",
                  ].map((s, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            <p className="text-xs text-center text-muted-foreground px-4">
              Tekan konfirmasi setelah pembayaran selesai. Status akan diperbarui otomatis.
            </p>
          </>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-background/95 backdrop-blur-sm border-t border-border space-y-2">
        {step === "amount" && (
          <Button onClick={goToMethod} disabled={selectedAmount < 1000} className={cta.primary}>
            Pilih Metode Pembayaran
          </Button>
        )}
        {step === "method" && (
          <Button onClick={() => void goToInstruction()} disabled={!selectedOption || loading} className={cta.primary}>
            {loading ? "Memproses..." : "Lanjutkan"}
          </Button>
        )}
        {step === "instruction" && (
          <Button onClick={() => void confirmPayment()} disabled={loading} className={cta.primary}>
            {loading ? "Mengkonfirmasi..." : "Saya Sudah Bayar"}
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ["amount", "method", "instruction"]
  const idx = steps.indexOf(current)
  if (idx < 0) return null
  return (
    <div className="flex items-center gap-1 mt-0.5">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`h-1 rounded-full transition-all ${
            i < idx ? "w-4 bg-primary" : i === idx ? "w-6 bg-primary" : "w-4 bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  )
}

function MethodRow({ option, selected, onSelect }: { option: PaymentOption; selected: boolean; onSelect: (o: PaymentOption) => void }) {
  return (
    <button
      onClick={() => onSelect(option)}
      className={`w-full flex items-center gap-4 p-3.5 ${interactive.cardSel} ${selected ? interactive.cardSelActive : interactive.cardSelInactive}`}
    >
      <div className={`p-2 rounded-xl ${selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
        {option.icon}
      </div>
      <div className="flex-1 text-left">
        <p className={`text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{option.label}</p>
        <p className="text-xs text-muted-foreground">{option.sublabel}</p>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
        selected ? "border-primary bg-primary" : "border-muted-foreground/30"
      }`}>
        {selected && <div className="w-2 h-2 bg-white rounded-full" />}
      </div>
    </button>
  )
}

function SuccessScreen({ transactionId, amount, method, onBuyAgain, onBack }: {
  transactionId: string
  amount: number
  method: PaymentOption | null
  onBuyAgain: () => void
  onBack?: () => void
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 space-y-6">
      <div className="bg-status-good/10 p-6 rounded-full">
        <CheckCircle size={64} className="text-status-good" />
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Pembayaran Berhasil</h1>
        <p className="text-muted-foreground text-sm mt-1">Token telah dikreditkan ke unit Anda</p>
      </div>

      <Card className="w-full max-w-sm bg-muted/30 p-5 space-y-3">
        <div className="flex justify-between items-center pb-3 border-b border-border">
          <span className="text-muted-foreground text-sm">ID Transaksi</span>
          <span className="font-mono text-xs font-medium text-foreground">{transactionId.slice(-12)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground text-sm">Nominal</span>
          <span className="font-bold text-foreground">Rp {amount.toLocaleString("id-ID")}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground text-sm">Metode</span>
          <span className="font-medium text-foreground">{method?.label ?? "-"}</span>
        </div>
      </Card>

      <div className="w-full max-w-sm space-y-3 pt-4">
        <Button className={cta.primary} onClick={onBuyAgain}>Beli Lagi</Button>
        <Button variant="outline" className={`${cta.secondary} border-primary text-primary`} onClick={onBack}>
          Kembali ke Beranda
        </Button>
      </div>
    </div>
  )
}
