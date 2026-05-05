// Unified design tokens - import from here, never hardcode Tailwind class strings inline

// ── Domain types ──────────────────────────────────────────────────────────────
export type BalanceStatus = "aman" | "kurang" | "kritis" | "terputus"
export type UtilityType   = "electricity" | "water"
export type TimePeriod    = "daily" | "weekly" | "monthly" | "live"
export type TxStatus      = "pending" | "success" | "failed"
export type Page          = "home" | "purchase" | "notifications"
export type PaymentMethod = "qris" | "transfer" | "ewallet"

// ── App constants ─────────────────────────────────────────────────────────────
export const DEFAULT_TARIFF = { kwh: 1444.70, water: 5000.00 } as const

export const TOKEN_AMOUNTS: readonly number[] = [20_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]
export const POPULAR_IDX = 2 // 0-indexed → 100k package

export const PAYMENT_METHODS = [
  { id: "qris"     as PaymentMethod, label: "QRIS" },
  { id: "transfer" as PaymentMethod, label: "Transfer Bank" },
  { id: "ewallet"  as PaymentMethod, label: "E-Wallet" },
] as const

// ── Status semantic map ───────────────────────────────────────────────────────
export type StatusInfo = {
  label:       string
  barColor:    string
  textColor:   string
  bgColor:     string
  borderColor: string
}

export const STATUS_MAP: Record<BalanceStatus, StatusInfo> = {
  aman:     { label: "Normal",       barColor: "bg-status-good",     textColor: "text-status-good",     bgColor: "bg-status-good/10",     borderColor: "border-status-good/20"     },
  kurang:   { label: "Hampir Habis", barColor: "bg-status-warn",     textColor: "text-status-warn",     bgColor: "bg-status-warn/10",     borderColor: "border-status-warn/20"     },
  kritis:   { label: "Kritis",       barColor: "bg-status-critical", textColor: "text-status-critical", bgColor: "bg-status-critical/10", borderColor: "border-status-critical/20" },
  terputus: { label: "Terputus",     barColor: "bg-status-offline",  textColor: "text-status-offline",  bgColor: "bg-muted",              borderColor: "border-border"             },
}

// ── Typography ────────────────────────────────────────────────────────────────
export const typo = {
  pageTitle:    "text-2xl font-bold text-foreground",
  sectionTitle: "text-base font-bold text-foreground",
  label:        "text-sm font-medium text-foreground",
  muted:        "text-sm text-muted-foreground",
  caption:      "text-xs text-muted-foreground",
}

// ── Interactive patterns ──────────────────────────────────────────────────────
export const interactive = {
  // Bottom nav tab
  navItem:     "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors duration-150",
  navActive:   "text-primary",
  navInactive: "text-muted-foreground active:text-primary/70",

  // Segmented pill (utility/period toggles)
  segRoot:     "flex gap-0.5 p-1 bg-muted rounded-xl",
  segItem:     "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-95",
  segActive:   "bg-card text-primary shadow-sm",
  segInactive: "text-muted-foreground active:bg-muted-foreground/10",

  // Selection card (package picker, payment method)
  cardSel:         "rounded-2xl border transition-all duration-150 cursor-pointer active:scale-[0.98]",
  cardSelActive:   "border-primary bg-primary/5 ring-1 ring-primary",
  cardSelInactive: "border-border active:border-primary/40 active:bg-muted/30 bg-card",

  // Icon ghost (back, settings)
  ghost:    "p-2 rounded-full active:bg-muted/70 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",

  // Text/inline link button
  textLink: "inline-flex items-center gap-1 text-primary active:text-primary/60 transition-colors duration-150 underline-offset-2 focus-visible:outline-none",
}

// ── Full-width CTA ────────────────────────────────────────────────────────────
export const cta = {
  primary:   "w-full bg-primary active:bg-primary/80 text-primary-foreground font-bold h-14 rounded-xl text-base shadow-sm disabled:opacity-40 disabled:pointer-events-none transition-all duration-150",
  secondary: "w-full border border-primary text-primary active:bg-primary/10 font-semibold h-12 rounded-xl text-base transition-all duration-150",
}

// ── Page shell helpers ────────────────────────────────────────────────────────
export const layout = {
  pageHeader: "flex items-center gap-4 px-4 py-3 sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border",
  section:    "px-5 space-y-6",
}
