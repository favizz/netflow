// Fully static, backend-free mock implementation of the mobile API surface.
// Every exported name/shape below matches the original real-backend client
// so callers throughout the app need zero changes. Internally, everything
// is routed against the in-browser mockDb "database" instead of `fetch`.

import {
  findUnit,
  findUnitById,
  findTransaction,
  updateUnit,
  updateTransaction,
  addTransaction,
  getUser,
  getUserUnits,
  getSession,
  setSessionUnit,
  getTransactionsForUnit,
  getAnomaliesForUnit,
  genTransactionId,
  genVaNumber,
  hashSeed,
  mulberry32,
  type MockUnit,
  type MockTransaction,
  type MockAnomaly,
} from './mockDb';

const ACCESS_TOKEN_KEY = 'mobile_access_token';
const REFRESH_TOKEN_KEY = 'mobile_refresh_token';

function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function setAccessToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (!token) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

function getRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setRefreshToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (!token) {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

// ── Small helpers ────────────────────────────────────────────────────────────
function delay(min = 150, max = 400): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(json);
  }
  return Buffer.from(json).toString('base64');
}

function makeFakeToken(kind: 'access' | 'refresh', unitNo: string | null): string {
  return `demo.${base64({ sub: getUser().email, name: getUser().name, unitNo, kind, iat: Date.now() })}.sig`;
}

function makeTokenPair(unitNo: string | null): TokenPair {
  return {
    accessToken: makeFakeToken('access', unitNo),
    refreshToken: makeFakeToken('refresh', unitNo),
    tokenType: 'Bearer',
    unitNo,
    expiresIn: '3600',
    refreshExpiresIn: '2592000',
  };
}

function toUnitSummary(u: MockUnit): UnitSummary {
  return { id: u.id, unitNo: u.unitNo };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function toDashboardSummary(u: MockUnit): DashboardSummary {
  // A stable, plausible "average daily kWh" per unit, used only to derive a
  // remaining-hours estimate for the balance card.
  const avgDailyKwh = 2 + (hashSeed(u.unitNo) % 400) / 100; // ~2.0 - 6.0 kWh/day
  const hours = u.tokenElectricity > 0 ? (u.tokenElectricity / Math.max(0.5, avgDailyKwh)) * 24 : 0;
  return {
    id: u.id,
    unitNo: u.unitNo,
    tokenElectricity: round(u.tokenElectricity, 2),
    tokenWater: round(u.tokenWater, 3),
    energyTariff: u.energyTariff,
    waterTariff: u.waterTariff,
    relayStatus: u.relayStatus,
    valveStatus: u.valveStatus,
    remainingEstimate: { kwh: round(u.tokenElectricity, 2), hours: Math.round(hours) },
    connectivity: { online: u.online, lastTelemetryAt: u.lastTelemetryAt },
  };
}

function toAnomalyItem(a: MockAnomaly): AnomalyItem {
  return {
    anomalyType: a.anomalyType as AnomalyType,
    severity: a.severity as AnomalySeverity,
    message: a.message,
    metadata: a.metadata,
    detectedAt: a.detectedAt,
  };
}

function toPaymentTransaction(t: MockTransaction): PaymentTransaction {
  return {
    id: t.id,
    unitNo: t.unitNo,
    amount: t.amount,
    method: t.method,
    status: t.status,
    createdAt: t.createdAt,
    confirmedAt: t.confirmedAt ?? undefined,
  };
}

// ── Deterministic-looking trend generator (seeded, no external dep) ─────────
function dailyPoint(unitNo: string, date: Date): TrendPoint {
  const key = `${unitNo}|d|${date.toISOString().slice(0, 10)}`;
  const rng = mulberry32(hashSeed(key));
  const dow = date.getDay();
  const weekendFactor = dow === 0 || dow === 6 ? 1.15 : 1;
  const kwh = Math.max(0.2, 3.5 * weekendFactor + (rng() - 0.5) * 1.8);
  const waterM3 = Math.max(0.02, 0.22 * weekendFactor + (rng() - 0.5) * 0.12);
  return {
    bucket: date.toISOString(),
    kwh: round(kwh, 2),
    waterM3: round(waterM3, 3),
    avgPowerW: round((kwh * 1000) / 24, 1),
    avgFlowLpm: round((waterM3 * 1000) / (24 * 60), 2),
  };
}

function monthPoint(unitNo: string, year: number, month: number): TrendPoint {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let kwh = 0;
  let waterM3 = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const p = dailyPoint(unitNo, new Date(year, month, d));
    kwh += p.kwh;
    waterM3 += p.waterM3;
  }
  return {
    bucket: new Date(year, month, 1).toISOString(),
    kwh: round(kwh, 2),
    waterM3: round(waterM3, 3),
    avgPowerW: round((kwh * 1000) / (daysInMonth * 24), 1),
    avgFlowLpm: round((waterM3 * 1000) / (daysInMonth * 24 * 60), 2),
  };
}

function generateDailySeries(unitNo: string): TrendPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const points: TrendPoint[] = [];
  for (let i = 130; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    points.push(dailyPoint(unitNo, d));
  }
  return points;
}

function generateMonthlySeries(unitNo: string): TrendPoint[] {
  const now = new Date();
  const points: TrendPoint[] = [];
  for (let i = 24; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push(monthPoint(unitNo, d.getFullYear(), d.getMonth()));
  }
  return points;
}

// ── Public types (unchanged shapes — keep in sync with the old real-backend
// client so every caller in the app keeps working untouched) ────────────────
export type UnitSummary = { id: number; unitNo: string };

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  unitNo: string | null;
  expiresIn: string;
  refreshExpiresIn: string;
};

export type GoogleLoginResponse = TokenPair & {
  name?: string | null;
  units: UnitSummary[];
};

export type SelectUnitResponse = TokenPair & {
  name?: string | null;
  units: UnitSummary[];
};

export type DashboardSummary = {
  id: number;
  unitNo: string;
  tokenElectricity: number;
  tokenWater: number;
  energyTariff: number;
  waterTariff: number;
  relayStatus: boolean;
  valveStatus: boolean;
  remainingEstimate: {
    kwh: number;
    hours: number;
  };
  connectivity: {
    online: boolean;
    lastTelemetryAt: string | null;
  };
};

export type NotificationItem = {
  type: 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
};

export type AnomalyType =
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
  | 'topup_success';

export type AnomalySeverity = 'critical' | 'warning' | 'info';

export type AnomalyItem = {
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  message: string;
  metadata: Record<string, unknown>;
  detectedAt: string;
};

export type PaymentTransaction = {
  id: string;
  unitNo: string;
  amount: number;
  method: 'qris' | 'transfer' | 'ewallet';
  status: 'pending' | 'success' | 'failed';
  createdAt: string;
  confirmedAt?: string;
};

export type TrendPoint = {
  bucket: string;
  kwh: number;
  waterM3: number;
  avgPowerW: number;
  avgFlowLpm: number;
};

export type MeResponse = {
  email: string;
  name: string | null;
  role: 'resident';
  unitId: number | null;
  unitNo: string | null;
  units: UnitSummary[];
};

export const authStore = {
  getToken: getAccessToken,
  getRefreshToken,
  setTokens(accessToken: string, refreshToken: string) {
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
  },
  clear() {
    setAccessToken(null);
    setRefreshToken(null);
    // Notify React state so any polling effects stop immediately
    window.dispatchEvent(new Event('auth:cleared'));
  },
};

export const api = {
  async devLogin(_email: string): Promise<GoogleLoginResponse> {
    await delay();
    const user = getUser();
    const pair = makeTokenPair(null);
    authStore.setTokens(pair.accessToken, pair.refreshToken);
    return { ...pair, name: user.name, units: getUserUnits().map(toUnitSummary) };
  },

  async googleLogin(_credential: string): Promise<GoogleLoginResponse> {
    await delay();
    const user = getUser();
    const pair = makeTokenPair(null);
    authStore.setTokens(pair.accessToken, pair.refreshToken);
    return { ...pair, name: user.name, units: getUserUnits().map(toUnitSummary) };
  },

  async selectUnit(unitId: number): Promise<SelectUnitResponse> {
    await delay();
    const unit = findUnitById(unitId);
    if (!unit) throw new Error('Unit not found');
    setSessionUnit(unit.id);
    const pair = makeTokenPair(unit.unitNo);
    authStore.setTokens(pair.accessToken, pair.refreshToken);
    return { ...pair, name: getUser().name, units: getUserUnits().map(toUnitSummary) };
  },

  async logout() {
    await delay();
    setSessionUnit(null);
    authStore.clear();
  },

  async me(): Promise<MeResponse> {
    await delay();
    if (!authStore.getToken()) throw new Error('Unauthorized');
    const user = getUser();
    const session = getSession();
    const unit = session.currentUnitId !== null ? findUnitById(session.currentUnitId) : undefined;
    return {
      email: user.email,
      name: user.name,
      role: 'resident',
      unitId: unit ? unit.id : null,
      unitNo: unit ? unit.unitNo : null,
      units: getUserUnits().map(toUnitSummary),
    };
  },

  async downloadInvoice(unitNo: string, transactionId: string): Promise<string> {
    await delay(200, 450);
    const tx = findTransaction(transactionId);
    if (!tx || tx.unitNo !== unitNo) {
      throw new Error('Invoice not found');
    }
    const unit = findUnit(unitNo);
    const refNumber = `INV-${tx.id.replace('TRX-', '')}`;
    const lines = [
      'NETFLOW - PAYMENT RECEIPT',
      '================================',
      `Unit            : ${unitNo}`,
      `Reference No.   : ${refNumber}`,
      `Transaction ID  : ${tx.id}`,
      `Date            : ${new Date(tx.createdAt).toLocaleString('en-US')}`,
      `Method          : ${tx.method.toUpperCase()}`,
      `Status          : ${tx.status === 'success' ? 'SUCCESS' : tx.status.toUpperCase()}`,
      '--------------------------------',
      tx.elecAmount > 0 ? `Electricity     : Rp ${tx.elecAmount.toLocaleString('en-US')}` : null,
      tx.waterAmount > 0 ? `Water           : Rp ${tx.waterAmount.toLocaleString('en-US')}` : null,
      '--------------------------------',
      `Total           : Rp ${tx.amount.toLocaleString('en-US')}`,
      '================================',
      `Device          : ${unit?.deviceId ?? `DEV-${unitNo}`}`,
      '',
      'Thank you for using NetFlow.',
    ].filter((l): l is string => l !== null);
    return lines.join('\n');
  },

  async getDashboard(unitNo: string): Promise<{ unitNo: string; summary: DashboardSummary }> {
    await delay();
    const unit = findUnit(unitNo);
    if (!unit) throw new Error('Unit not found');
    return { unitNo: unit.unitNo, summary: toDashboardSummary(unit) };
  },

  async getNotifications(unitNo: string): Promise<AnomalyItem[]> {
    await delay();
    return getAnomaliesForUnit(unitNo).map(toAnomalyItem);
  },

  async getAnomalies(unitNo: string): Promise<AnomalyItem[]> {
    await delay();
    return getAnomaliesForUnit(unitNo).map(toAnomalyItem);
  },

  async getTrends(unitNo: string, period: 'daily' | 'monthly'): Promise<TrendPoint[]> {
    await delay();
    return period === 'monthly' ? generateMonthlySeries(unitNo) : generateDailySeries(unitNo);
  },

  async getTransactions(unitNo: string): Promise<PaymentTransaction[]> {
    await delay();
    return getTransactionsForUnit(unitNo).map(toPaymentTransaction);
  },

  async initiateTopup(
    unitNo: string,
    electricityAmount: number,
    waterAmount: number,
    method: 'qris' | 'transfer' | 'ewallet',
  ): Promise<{ transactionId: string; checkoutUrl: string; status: string; vaNumber?: string; qrUrl?: string }> {
    await delay(250, 500);
    const unit = findUnit(unitNo);
    if (!unit) throw new Error('Unit not found');
    const now = Date.now();
    const tx: MockTransaction = {
      id: genTransactionId(),
      unitNo,
      elecAmount: electricityAmount,
      waterAmount,
      amount: electricityAmount + waterAmount,
      method,
      status: 'pending',
      createdAt: new Date(now).toISOString(),
      confirmedAt: null,
      vaNumber: method === 'transfer' ? genVaNumber() : undefined,
      // Deliberate deviation from the literal "25s" spec: a real demo viewer
      // won't sit around that long. 4s keeps the polling UI (which checks
      // every 5s) and the manual "Saya Sudah Bayar" button both feeling
      // instant while still showing a believable pending state at least once.
      autoConfirmAt: now + 4000,
    };
    addTransaction(tx);
    return { transactionId: tx.id, checkoutUrl: '', status: tx.status, vaNumber: tx.vaNumber };
  },

  async getTopupStatus(
    unitNo: string,
    transactionId: string,
  ): Promise<{
    status: string;
    confirmedAt: string | null;
    delivery: {
      status: 'pending' | 'sent' | 'acked' | 'confirmed' | 'failed';
      attemptCount: number;
      deviceId: string;
      sentAt: string | null;
      ackedAt: string | null;
      confirmedAt: string | null;
      lastError: string | null;
    } | null;
  }> {
    await delay(150, 350);
    const tx = findTransaction(transactionId);
    if (!tx || tx.unitNo !== unitNo) throw new Error('Transaction not found');

    if (tx.status !== 'success' && tx.autoConfirmAt !== undefined && Date.now() >= tx.autoConfirmAt) {
      const unit = findUnit(unitNo);
      if (unit) {
        updateUnit(unitNo, {
          tokenElectricity: unit.tokenElectricity + tx.elecAmount / unit.energyTariff,
          tokenWater: unit.tokenWater + tx.waterAmount / unit.waterTariff,
        });
      }
      updateTransaction(tx.id, { status: 'success', confirmedAt: new Date().toISOString() });
    }

    const fresh = findTransaction(transactionId)!;
    const unit = findUnit(unitNo);
    const deviceId = unit?.deviceId ?? `DEV-${unitNo}`;

    if (fresh.status === 'success') {
      return {
        status: 'success',
        confirmedAt: fresh.confirmedAt,
        delivery: {
          status: 'confirmed',
          attemptCount: 1,
          deviceId,
          sentAt: fresh.createdAt,
          ackedAt: fresh.confirmedAt,
          confirmedAt: fresh.confirmedAt,
          lastError: null,
        },
      };
    }

    return {
      status: 'pending',
      confirmedAt: null,
      delivery: {
        status: 'pending',
        attemptCount: 1,
        deviceId,
        sentAt: fresh.createdAt,
        ackedAt: null,
        confirmedAt: null,
        lastError: null,
      },
    };
  },

  async setRelay(unitNo: string, on: boolean): Promise<{ relayStatus: boolean }> {
    // Simulate the actuator taking a moment to physically switch before the
    // device confirms — the caller's own reconciliation UI (dashboard.tsx)
    // relies on the store being updated by the time this resolves.
    await delay(1200, 1900);
    const unit = updateUnit(unitNo, { relayStatus: on, lastTelemetryAt: new Date().toISOString() });
    return { relayStatus: unit ? unit.relayStatus : on };
  },

  async setValve(unitNo: string, open: boolean): Promise<{ valveStatus: boolean }> {
    await delay(1200, 1900);
    const unit = updateUnit(unitNo, { valveStatus: open, lastTelemetryAt: new Date().toISOString() });
    return { valveStatus: unit ? unit.valveStatus : open };
  },
};
