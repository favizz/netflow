"use client"

import { Card } from "@/components/ui/card"
import { CheckCircle2, Clock, AlertCircle, ArrowUp, ArrowDown } from "lucide-react"
import type { Transaction } from "@/hooks/use-app-state"

interface TransactionHistoryProps {
  transactions: Transaction[]
}

export default function TransactionHistory({ transactions }: TransactionHistoryProps) {
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
      {transactions.slice(0, 10).map((transaction) => (
        <Card key={transaction.id} className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-start gap-3">
              <div className={`mt-1 ${transaction.type === "purchase" ? "text-primary" : "text-blue-500"}`}>
                {transaction.type === "purchase" ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {transaction.type === "purchase" ? "Pembelian Token" : "Konsumsi Utilitas"}
                </p>
                <p className="text-xs text-muted-foreground">ID: {transaction.id}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(transaction.timestamp).toLocaleString("id-ID")}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-foreground">Rp {transaction.amount.toLocaleString("id-ID")}</p>
              {transaction.method && <p className="text-xs text-muted-foreground">{transaction.method}</p>}
            </div>
          </div>

          {/* Transaction Details */}
          <div className="grid grid-cols-3 gap-2 text-xs mb-3 px-8">
            <div>
              <span className="text-muted-foreground">Status</span>
              <div className="flex items-center gap-1 mt-1">
                {getStatusIcon(transaction.status)}
                <span className={`font-medium ${getStatusColor(transaction.status)}`}>
                  {getStatusLabel(transaction.status)}
                </span>
              </div>
            </div>
            {transaction.unitsAdded && (
              <div>
                <span className="text-muted-foreground">Unit</span>
                <p className="font-semibold text-foreground mt-1">
                  {transaction.unitsAdded > 0 ? "+" : ""}
                  {transaction.unitsAdded} {transaction.unitType === "kwh" ? "KWh" : "M³"}
                </p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Tarif</span>
              <p className="font-semibold text-foreground mt-1">
                {transaction.type === "purchase" && transaction.unitsAdded
                  ? `Rp ${(transaction.amount / transaction.unitsAdded).toFixed(0)}/unit`
                  : "—"}
              </p>
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
      ))}
    </div>
  )
}
