"use client"

import { Card } from "@/components/ui/card"
import { CheckCircle2, Clock, AlertCircle, ArrowUp, ArrowDown, Download } from "lucide-react"
import { interactive } from "@/lib/styles"

export interface HistoryTransaction {
  id: string
  timestamp?: string
  createdAt?: string
  amount: number
  type?: "purchase" | "consumption"
  status: "success" | "pending" | "failed"
  method?: string
  unitsAdded?: number
  unitType?: "kwh" | "water"
  errorMessage?: string
}

interface TransactionHistoryProps {
  transactions: HistoryTransaction[]
  onDownloadInvoice?: (transactionId: string) => void
}

export default function TransactionHistory({ transactions, onDownloadInvoice }: TransactionHistoryProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "text-primary"
      case "pending":
        return "text-amber-500"
      case "failed":
        return "text-destructive"
      default:
        return "text-muted-foreground"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 size={16} className={getStatusColor(status)} />
      case "pending":
        return <Clock size={16} className={getStatusColor(status)} />
      case "failed":
        return <AlertCircle size={16} className={getStatusColor(status)} />
      default:
        return null
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "success":
        return "Berhasil"
      case "pending":
        return "Diproses"
      case "failed":
        return "Gagal"
      default:
        return status
    }
  }

  if (transactions.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground text-sm">Belum ada transaksi</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">Riwayat Transaksi</p>
      {transactions.slice(0, 10).map((transaction) => {
        const isPurchase = (transaction.type || "purchase") === "purchase"
        const txTime = transaction.timestamp || transaction.createdAt || new Date().toISOString()

        return (
          <Card key={transaction.id} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-start gap-3">
                <div className={`mt-1 ${isPurchase ? "text-primary" : "text-blue-500"}`}>
                  {isPurchase ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{isPurchase ? "Pembelian Token" : "Konsumsi Utilitas"}</p>
                  <p className="text-xs text-muted-foreground">ID: {transaction.id}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(txTime).toLocaleString("en-US")}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">Rp {transaction.amount.toLocaleString("en-US")}</p>
                {transaction.method && <p className="text-xs text-muted-foreground">{transaction.method}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mb-3 px-8">
              <div>
                <span className="text-muted-foreground">Status</span>
                <div className="flex items-center gap-1 mt-1">
                  {getStatusIcon(transaction.status)}
                  <span className={`font-medium ${getStatusColor(transaction.status)}`}>{getStatusLabel(transaction.status)}</span>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Invoice</span>
                {onDownloadInvoice ? (
                  <button
                    className={`mt-1 ${interactive.textLink}`}
                    onClick={() => onDownloadInvoice(transaction.id)}
                  >
                    <Download size={12} />
                    Unduh
                  </button>
                ) : (
                  <p className="font-semibold text-foreground mt-1">-</p>
                )}
              </div>
            </div>

            {transaction.status === "failed" && transaction.errorMessage && (
              <div className="px-8 py-2 bg-destructive/5 rounded text-xs text-destructive border border-destructive/20">
                {transaction.errorMessage}
              </div>
            )}

            {transaction.status === "pending" && (
              <div className="px-8 py-2 bg-amber-500/5 rounded text-xs text-amber-700 border border-amber-500/20">
                Transaksi sedang diproses. Mohon tunggu...
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
