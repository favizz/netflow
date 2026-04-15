export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:5000';
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

let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    throw new Error('Refresh token failed');
  }

  const data = (await response.json()) as TokenPair;
  setAccessToken(data.accessToken);
  setRefreshToken(data.refreshToken);
}

async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };

  const isForm = init?.body instanceof FormData;
  if (!isForm) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401 && retry && getRefreshToken()) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken()
        .catch((error) => {
          authStore.clear();
          throw error;
        })
        .finally(() => {
          isRefreshing = false;
        });
    }

    if (refreshPromise) {
      await refreshPromise;
      return request<T>(path, init, false);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return {} as T;
  }

  return (await response.json()) as T;
}

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
  units: UnitSummary[];
};

export type SelectUnitResponse = TokenPair & {
  units: UnitSummary[];
};

export type DashboardSummary = {
  id: number;
  unitNo: string;
  balance: number;
  energyTariff: number;
  relayStatus: boolean;
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
  | 'low_balance'
  | 'voltage_anomaly'
  | 'sensor_malfunction'
  | 'low_power_factor'
  | 'zero_flow'
  | 'usage_spike'
  | 'topup_success'
  | 'backflow';

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
  },
};

export const api = {
  devLogin(email: string) {
    return request<GoogleLoginResponse>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ email }),
      headers: { 'Content-Type': 'application/json' },
    }).then((res) => {
      authStore.setTokens(res.accessToken, res.refreshToken);
      return res;
    });
  },

  googleLogin(credential: string) {
    return request<GoogleLoginResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
      headers: { 'Content-Type': 'application/json' },
    }).then((res) => {
      authStore.setTokens(res.accessToken, res.refreshToken);
      return res;
    });
  },

  selectUnit(unitId: number) {
    return request<SelectUnitResponse>('/auth/select-unit', {
      method: 'POST',
      body: JSON.stringify({ unitId }),
    }).then((res) => {
      authStore.setTokens(res.accessToken, res.refreshToken);
      return res;
    });
  },

  async logout() {
    const refreshToken = authStore.getRefreshToken();
    try {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } finally {
      authStore.clear();
    }
  },

  me() {
    return request<MeResponse>('/auth/me');
  },

  async downloadInvoice(unitNo: string, transactionId: string): Promise<string> {
    const token = authStore.getToken();
    const response = await fetch(
      `${API_BASE_URL}/gateway/mobile/${encodeURIComponent(unitNo)}/invoice/${encodeURIComponent(transactionId)}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );

    if (response.status === 401 && authStore.getRefreshToken()) {
      await refreshAccessToken();
      return this.downloadInvoice(unitNo, transactionId);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Invoice download failed (${response.status})`);
    }

    return response.text();
  },

  getDashboard(unitNo: string) {
    return request<{ unitNo: string; summary: DashboardSummary; notifications: NotificationItem[] }>(
      `/gateway/mobile/${encodeURIComponent(unitNo)}/dashboard`,
    );
  },

  getNotifications(unitNo: string) {
    return request<NotificationItem[]>(`/gateway/mobile/${encodeURIComponent(unitNo)}/notifications`);
  },

  getAnomalies(unitNo: string) {
    return request<AnomalyItem[]>(`/gateway/mobile/${encodeURIComponent(unitNo)}/anomalies`);
  },

  getTowerConnectivity(tower?: string) {
    const query = tower ? `?tower=${encodeURIComponent(tower)}` : '';
    return request<{
      totalUnits: number;
      onlineUnits: number;
      offlineUnits: number;
      units: Array<{ unitNo: string; online: boolean; relayStatus: boolean; lastTelemetryAt: string | null }>;
    }>(`/gateway/tower/connectivity${query}`);
  },

  getTrends(unitNo: string, period: 'daily' | 'monthly') {
    return request<TrendPoint[]>(`/gateway/mobile/${encodeURIComponent(unitNo)}/trends?period=${period}`);
  },

  getTransactions(unitNo: string) {
    return request<PaymentTransaction[]>(`/gateway/mobile/${encodeURIComponent(unitNo)}/transactions`);
  },

  initiateTopup(unitNo: string, amount: number, method: 'qris' | 'transfer' | 'ewallet') {
    return request<{ transactionId: string; checkoutUrl: string; status: string; vaNumber?: string; qrUrl?: string }>(
      `/gateway/mobile/${encodeURIComponent(unitNo)}/topup/initiate`,
      {
        method: 'POST',
        body: JSON.stringify({ amount, method }),
      },
    );
  },


  autoConfirmTopup(unitNo: string, transactionId: string) {
    return request<PaymentTransaction>(
      `/gateway/mobile/${encodeURIComponent(unitNo)}/topup/auto-confirm/${encodeURIComponent(transactionId)}`,
      {
        method: 'POST',
      },
    );
  },

  setRelay(unitNo: string, on: boolean) {
    return request<{ relayStatus: boolean }>(
      `/gateway/mobile/${encodeURIComponent(unitNo)}/relay`,
      {
        method: 'POST',
        body: JSON.stringify({ status: on }),
      },
    );
  },

  setValve(unitNo: string, open: boolean) {
    return request<{ valveStatus: boolean }>(
      `/gateway/mobile/${encodeURIComponent(unitNo)}/valve`,
      {
        method: 'POST',
        body: JSON.stringify({ status: open }),
      },
    );
  },
};
