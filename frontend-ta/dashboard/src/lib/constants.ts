export const PAGE_SIZE = 10;

export const STORAGE_KEYS = {
    adminToken: 'admin-token',
    dashboardTheme: 'dashboard-theme',
} as const;

export const INPUT_LIMITS = {
    email: { maxLength: 255 },
    name: { maxLength: 100 },
    unitNo: { pattern: /^[A-Z]-\d{3,4}$/, maxLength: 10 },
    deviceId: { maxLength: 100 },
    balance: { min: 0, max: 99_999_999 },
    tariffPrice: { min: 0, max: 99_999_999, step: 0.01 },
    calFactorFlowrate: { min: 0, max: 5, step: 0.01 },
    calFactorPower: { min: 0, max: 2, step: 0.01 },
    sensorSamplingTime: { min: 1, max: 10, step: 1 },
} as const;
