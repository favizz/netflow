"use client"

import { useState, useCallback } from "react"

export interface UserState {
  unitId: string
  name: string
  building: string
  role: "tenant" | "technician" | "admin"
}

export interface DeviceStatus {
  id: string
  type: "electricity" | "water"
  status: "on" | "off"
  connectivity: "connected" | "disconnected"
  signalStrength: number // 0-100
  lastTelemetry: string
  batteryLevel?: number // 0-100
  tampering: boolean
}

export interface UtilityStatus {
  kwh: number
  maxKwh: number
  water: number
  maxWater: number
  lastUpdated: string
  conversionRate: {
    kwh: number // Rp per KWh
    water: number // Rp per M³
  }
}

export interface Transaction {
  id: string
  timestamp: string
  amount: number
  type: "purchase" | "consumption"
  status: "success" | "pending" | "failed"
  method?: string
  unitsAdded?: number
  unitType?: "kwh" | "water"
  errorMessage?: string
}

export interface Alert {
  id: string
  type: "warning" | "error" | "info"
  message: string
  timestamp: string
}

// Mock data generator
const generateMockData = (unitId: string) => {
  const seed = unitId.charCodeAt(0) + unitId.charCodeAt(unitId.length - 1)
  const random = (max: number) => {
    const x = Math.sin(seed) * 10000
    return Math.floor((x - Math.floor(x)) * max)
  }

  return {
    kwh: random(80),
    maxKwh: 100,
    water: random(30),
    maxWater: 50,
    lastUpdated: new Date().toLocaleString("en-US"),
    conversionRate: {
      kwh: 1800,
      water: 4800,
    },
  }
}

export function useAppState() {
  const [utility, setUtility] = useState<UtilityStatus>(() => generateMockData("UNIT-001"))

  const [devices, setDevices] = useState<DeviceStatus[]>(() => [
    {
      id: "meter-kwh-001",
      type: "electricity",
      status: "on",
      connectivity: "connected",
      signalStrength: 85,
      lastTelemetry: new Date(Date.now() - 30000).toISOString(),
      batteryLevel: 92,
      tampering: false,
    },
    {
      id: "meter-water-001",
      type: "water",
      status: "on",
      connectivity: "connected",
      signalStrength: 78,
      lastTelemetry: new Date(Date.now() - 45000).toISOString(),
      tampering: false,
    },
  ])

  const [transactions, setTransactions] = useState<Transaction[]>(() => [
    {
      id: "TRX-20250103-001",
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      amount: 100000,
      type: "purchase",
      status: "success",
      method: "QRIS",
      unitsAdded: 45,
      unitType: "kwh",
    },
    {
      id: "TRX-20250102-001",
      timestamp: new Date(Date.now() - 172800000).toISOString(),
      amount: 30705,
      type: "consumption",
      status: "success",
      unitsAdded: -12.5,
      unitType: "kwh",
    },
  ])

  const [alerts, setAlerts] = useState<Alert[]>(() => [
    {
      id: "1",
      type: "warning",
      message: "Saldo KWh Anda hampir habis",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
  ])

  const updateUtility = useCallback((kwh: number, water: number) => {
    setUtility((prev) => ({
      ...prev,
      kwh: Math.max(0, Math.min(prev.maxKwh, kwh)),
      water: Math.max(0, Math.min(prev.maxWater, water)),
      lastUpdated: new Date().toLocaleString("en-US"),
    }))
  }, [])

  const updateDeviceStatus = useCallback((deviceId: string, updates: Partial<DeviceStatus>) => {
    setDevices((prev) =>
      prev.map((device) =>
        device.id === deviceId ? { ...device, ...updates, lastTelemetry: new Date().toISOString() } : device,
      ),
    )
  }, [])

  const toggleDeviceControl = useCallback(
    (deviceId: string, newStatus: "on" | "off") => {
      updateDeviceStatus(deviceId, { status: newStatus })
    },
    [updateDeviceStatus],
  )

  const addTransaction = useCallback(
    (transaction: Omit<Transaction, "id" | "timestamp">) => {
      const newTransaction: Transaction = {
        ...transaction,
        id: `TRX-${new Date().toISOString().split("T")[0]}-${String(transactions.length + 1).padStart(3, "0")}`,
        timestamp: new Date().toISOString(),
      }
      setTransactions((prev) => [newTransaction, ...prev].slice(0, 50))
    },
    [transactions.length],
  )

  const addAlert = useCallback((type: Alert["type"], message: string) => {
    const newAlert: Alert = {
      id: Date.now().toString(),
      type,
      message,
      timestamp: new Date().toISOString(),
    }
    setAlerts((prev) => [newAlert, ...prev].slice(0, 10))
  }, [])

  const removeAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id))
  }, [])

  return {
    utility,
    devices,
    transactions,
    alerts,
    updateUtility,
    updateDeviceStatus,
    toggleDeviceControl,
    addTransaction,
    addAlert,
    removeAlert,
  }
}
