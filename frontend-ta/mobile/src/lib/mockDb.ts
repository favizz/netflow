// In-memory mock data store for the fully static NetFlow mobile demo.
// Persisted to localStorage so state survives reloads; resettable via resetMockDb().
// This file owns the "database" only — request timing / HTTP-shaped responses
// live in api.ts, which maps these records onto the app's public API types.

export type MockAnomalyType =
  | 'jailbreak'
  | 'water_leak'
  | 'device_offline'
  | 'mcb_trip'
  | 'low_electricity_token'
  | 'low_water_token'
  | 'voltage_anomaly'
  | 'sensor_malfunction'
  | 'low_power_factor'
  | 'usage_spike'
  | 'zero_flow'
  | 'backflow'
  | 'topup_success'

export type MockAnomalySeverity = 'critical' | 'warning' | 'info'
export type MockPaymentMethod = 'qris' | 'transfer' | 'ewallet'
export type MockTxStatus = 'pending' | 'success' | 'failed'

export interface MockBuilding {
  id: number
  code: string
  name: string
}

export interface MockUnit {
  id: number
  unitNo: string
  deviceId: string
  buildingId: number
  tokenElectricity: number
  tokenWater: number
  energyTariff: number
  waterTariff: number
  relayStatus: boolean
  valveStatus: boolean
  online: boolean
  lastTelemetryAt: string
}

export interface MockTransaction {
  id: string
  unitNo: string
  elecAmount: number
  waterAmount: number
  amount: number
  method: MockPaymentMethod
  status: MockTxStatus
  createdAt: string
  confirmedAt: string | null
  vaNumber?: string
  // Wall-clock time (ms epoch) after which a status check will finalize the
  // transaction as successful — simulates the device confirming the top-up.
  autoConfirmAt?: number
}

export interface MockAnomaly {
  id: string
  unitNo: string
  deviceId: string
  anomalyType: MockAnomalyType
  severity: MockAnomalySeverity
  message: string
  metadata: Record<string, unknown>
  detectedAt: string
}

export interface MockUser {
  email: string
  name: string
  unitIds: number[]
}

export interface MockSession {
  currentUnitId: number | null
}

export interface MockDbShape {
  buildings: MockBuilding[]
  units: MockUnit[]
  transactions: MockTransaction[]
  anomalies: MockAnomaly[]
  user: MockUser
  session: MockSession
}

const STORAGE_KEY = 'netflow_mobile_demo_store_v1'

// ── Seeded RNG (mulberry32) — shared with mockTelemetry.ts for stable-looking
// per-device randomness that doesn't require any external dependency. ───────
export function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function daysAgoIso(days: number, hoursOffset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hoursOffset)
  return d.toISOString()
}

function genUnit(unitNo: string, buildingId: number, seq: number, overrides: Partial<MockUnit> = {}): MockUnit {
  const rng = mulberry32(hashSeed(unitNo))
  return {
    id: seq,
    unitNo,
    deviceId: `DEV-${unitNo}`,
    buildingId,
    tokenElectricity: Number((8 + rng() * 40).toFixed(2)),
    tokenWater: Number((1.5 + rng() * 10).toFixed(3)),
    energyTariff: 1500,
    waterTariff: 5500,
    relayStatus: true,
    valveStatus: true,
    online: rng() > 0.12,
    lastTelemetryAt: new Date().toISOString(),
    ...overrides,
  }
}

function genTxId(seq: number): string {
  return `TRX-${String(20_000_000 + seq * 3_701).slice(-8)}`
}

function seed(): MockDbShape {
  const buildings: MockBuilding[] = [
    { id: 1, code: 'TOWER-A', name: 'Tower A' },
    { id: 2, code: 'TOWER-B', name: 'Tower B' },
    { id: 3, code: 'TOWER-C', name: 'Tower C' },
  ]

  const unitDefs: { unitNo: string; buildingId: number }[] = [
    { unitNo: 'A-101', buildingId: 1 }, { unitNo: 'A-102', buildingId: 1 }, { unitNo: 'A-103', buildingId: 1 },
    { unitNo: 'A-201', buildingId: 1 }, { unitNo: 'A-202', buildingId: 1 }, { unitNo: 'A-203', buildingId: 1 },
    { unitNo: 'A-301', buildingId: 1 }, { unitNo: 'A-302', buildingId: 1 },
    { unitNo: 'B-101', buildingId: 2 }, { unitNo: 'B-102', buildingId: 2 }, { unitNo: 'B-201', buildingId: 2 },
    { unitNo: 'B-202', buildingId: 2 }, { unitNo: 'B-301', buildingId: 2 },
    { unitNo: 'C-101', buildingId: 3 }, { unitNo: 'C-102', buildingId: 3 },
    { unitNo: 'C-201', buildingId: 3 }, { unitNo: 'C-202', buildingId: 3 },
  ]

  const units: MockUnit[] = unitDefs.map((def, i) => {
    const seq = i + 1
    if (def.unitNo === 'A-101') {
      return genUnit(def.unitNo, def.buildingId, seq, {
        tokenElectricity: 45.3, tokenWater: 12.4, online: true, relayStatus: true, valveStatus: true,
      })
    }
    if (def.unitNo === 'B-201') {
      return genUnit(def.unitNo, def.buildingId, seq, {
        tokenElectricity: 38.7, tokenWater: 9.6, online: true, relayStatus: true, valveStatus: true,
      })
    }
    return genUnit(def.unitNo, def.buildingId, seq)
  })

  const aUnit = units.find(u => u.unitNo === 'A-101')!
  const bUnit = units.find(u => u.unitNo === 'B-201')!

  const user: MockUser = {
    email: 'resident@netflow.demo',
    name: 'Jane Doe',
    unitIds: [aUnit.id, bUnit.id],
  }

  const transactions: MockTransaction[] = [
    {
      id: genTxId(1),
      unitNo: 'A-101',
      elecAmount: 100_000,
      waterAmount: 0,
      amount: 100_000,
      method: 'qris',
      status: 'success',
      createdAt: daysAgoIso(21, 3),
      confirmedAt: daysAgoIso(21, 3),
    },
    {
      id: genTxId(2),
      unitNo: 'A-101',
      elecAmount: 50_000,
      waterAmount: 30_000,
      amount: 80_000,
      method: 'transfer',
      status: 'success',
      createdAt: daysAgoIso(10, 6),
      confirmedAt: daysAgoIso(10, 6),
    },
    {
      id: genTxId(3),
      unitNo: 'A-101',
      elecAmount: 150_000,
      waterAmount: 0,
      amount: 150_000,
      method: 'qris',
      status: 'success',
      createdAt: daysAgoIso(2, 8),
      confirmedAt: daysAgoIso(2, 8),
    },
  ]

  const anomalies: MockAnomaly[] = [
    {
      id: 'ANM-1001', unitNo: 'A-101', deviceId: 'DEV-A-101',
      anomalyType: 'low_electricity_token', severity: 'warning',
      message: 'Electricity token has 4.2 kWh remaining — top up soon.',
      metadata: { remainingKwh: 4.2 },
      detectedAt: daysAgoIso(2, 4),
    },
    {
      id: 'ANM-1002', unitNo: 'A-101', deviceId: 'DEV-A-101',
      anomalyType: 'usage_spike', severity: 'info',
      message: 'Electricity consumption is up 65% compared to the daily average.',
      metadata: { increasePct: 65 },
      detectedAt: daysAgoIso(5, 2),
    },
    {
      id: 'ANM-1003', unitNo: 'A-101', deviceId: 'DEV-A-101',
      anomalyType: 'voltage_anomaly', severity: 'critical',
      message: 'Voltage detected at 245V, outside the normal range of 210-230V.',
      metadata: { voltage: 245 },
      detectedAt: daysAgoIso(9, 1),
    },
    {
      id: 'ANM-1004', unitNo: 'A-101', deviceId: 'DEV-A-101',
      anomalyType: 'device_offline', severity: 'warning',
      message: 'Device DEV-A-101 has not sent data for 20 minutes.',
      metadata: { minutesOffline: 20 },
      detectedAt: daysAgoIso(13, 5),
    },
  ]

  return {
    buildings,
    units,
    transactions,
    anomalies,
    user,
    session: { currentUnitId: null },
  }
}

function load(): MockDbShape {
  if (typeof window === 'undefined') return seed()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const s = seed()
      persist(s)
      return s
    }
    return JSON.parse(raw) as MockDbShape
  } catch {
    const s = seed()
    persist(s)
    return s
  }
}

function persist(next: MockDbShape) {
  // Note: intentionally does NOT assign to the module-level `db` variable —
  // it's called from load()'s own initializer (before `db` exists) and from
  // save() (where `db` is already the current in-memory object being written).
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore quota / privacy-mode errors — demo state just won't persist.
  }
}

let db: MockDbShape = load()

function save() {
  persist(db)
}

/** Clears persisted demo state. Caller is expected to reload the page afterwards. */
export function resetMockDb() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export function findUnit(unitNo: string): MockUnit | undefined {
  return db.units.find(u => u.unitNo === unitNo)
}

export function findUnitById(id: number): MockUnit | undefined {
  return db.units.find(u => u.id === id)
}

export function findUnitByDeviceId(deviceId: string): MockUnit | undefined {
  return db.units.find(u => u.deviceId === deviceId)
}

export function updateUnit(unitNo: string, patch: Partial<MockUnit>): MockUnit | undefined {
  const unit = findUnit(unitNo)
  if (!unit) return undefined
  Object.assign(unit, patch)
  save()
  return unit
}

export function getUser(): MockUser {
  return db.user
}

export function getUserUnits(): MockUnit[] {
  return db.user.unitIds
    .map(id => findUnitById(id))
    .filter((u): u is MockUnit => !!u)
}

export function getSession(): MockSession {
  return db.session
}

export function setSessionUnit(unitId: number | null) {
  db.session.currentUnitId = unitId
  save()
}

export function addTransaction(tx: MockTransaction) {
  db.transactions.unshift(tx)
  save()
}

export function findTransaction(id: string): MockTransaction | undefined {
  return db.transactions.find(t => t.id === id)
}

export function updateTransaction(id: string, patch: Partial<MockTransaction>): MockTransaction | undefined {
  const tx = findTransaction(id)
  if (!tx) return undefined
  Object.assign(tx, patch)
  save()
  return tx
}

export function getTransactionsForUnit(unitNo: string): MockTransaction[] {
  return db.transactions
    .filter(t => t.unitNo === unitNo)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getAnomaliesForUnit(unitNo: string): MockAnomaly[] {
  return db.anomalies
    .filter(a => a.unitNo === unitNo)
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
}

export function genTransactionId(): string {
  return `TRX-${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
}

export function genVaNumber(): string {
  return `8808${Math.floor(100_000 + Math.random() * 899_999)}`
}
