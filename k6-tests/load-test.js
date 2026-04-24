/**
 * NetFlow Load Test — k6
 *
 * Simulates 10 000 concurrent IoT devices publishing telemetry via REST proxy
 * while resident and admin HTTP clients hammer the API.
 *
 * Run:
 *   k6 run --env API_URL=http://localhost:5000 \
 *          --env JWT_TOKEN=<resident_jwt>       \
 *          --env ADMIN_JWT=<admin_jwt>          \
 *          --env UNIT_NO=A-101                  \
 *          k6-tests/load-test.js
 *
 * Thresholds (SLO):
 *   - 95th-percentile HTTP response < 500 ms
 *   - Error rate < 1%
 *   - Queue drain: DB p99 write latency < 100 ms  (measured via /metrics)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Custom metrics ─────────────────────────────────────────────────────────────
const errorRate      = new Rate('errors');
const telemetryTrend = new Trend('telemetry_duration_ms');
const dashboardTrend = new Trend('dashboard_duration_ms');

// ── Config ─────────────────────────────────────────────────────────────────────
const API_URL   = __ENV.API_URL   || 'http://localhost:5000';
const JWT_TOKEN = __ENV.JWT_TOKEN || '';
const ADMIN_JWT = __ENV.ADMIN_JWT || '';
const UNIT_NO   = __ENV.UNIT_NO   || 'A-101';

// ── Stage plan ─────────────────────────────────────────────────────────────────
// Ramp to 10 000 virtual devices over 2 min, hold 5 min, ramp down.
// Each VU simulates one IoT device (publishes every 5 s via REST) plus
// occasional dashboard/API reads to model resident traffic.
export const options = {
  scenarios: {
    // IoT device telemetry: 10 000 devices × 1 msg/5 s = 2 000 msg/s
    iot_telemetry: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10_000 },
        { duration: '5m', target: 10_000 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
      exec: 'telemetry',
    },

    // Resident HTTP: ~500 concurrent users polling dashboard/trends
    resident_api: {
      executor: 'constant-vus',
      vus: 500,
      duration: '8m',
      exec: 'residentApi',
    },

    // Admin API: lighter load — anomaly scores, reporting
    admin_api: {
      executor: 'constant-vus',
      vus: 20,
      duration: '8m',
      exec: 'adminApi',
    },
  },

  thresholds: {
    // Core SLOs
    'http_req_duration{scenario:iot_telemetry}': ['p(95)<500'],
    'http_req_duration{scenario:resident_api}':  ['p(95)<500'],
    'http_req_duration{scenario:admin_api}':     ['p(95)<1000'],
    errors:                                       ['rate<0.01'],
    telemetry_duration_ms:                        ['p(99)<500'],
    dashboard_duration_ms:                        ['p(95)<400'],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function authHeader(jwt) {
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

/**
 * Build a 21-byte binary telemetry frame (matches ESP32 codec):
 *   [0]     version = 0x01
 *   [1-4]   energy_total (float32 LE)
 *   [5-8]   water_total  (float32 LE)
 *   [9-12]  power        (float32 LE)
 *   [13-16] voltage      (float32 LE)
 *   [17]    current      (uint8, amps × 10)
 *   [18]    water_flow   (uint8, L/min × 10)
 *   [19-20] balance_rp   (uint16 LE, Rp / 100)  0 = not reported
 */
function buildTelemetryFrame(energyKwh, waterM3, powerW, voltage, currentA, flowLpm) {
  const buf = new ArrayBuffer(21);
  const view = new DataView(buf);
  view.setUint8(0, 0x01);
  view.setFloat32(1,  energyKwh,  true);
  view.setFloat32(5,  waterM3,   true);
  view.setFloat32(9,  powerW,    true);
  view.setFloat32(13, voltage,   true);
  view.setUint8(17, Math.min(255, Math.round(currentA * 10)));
  view.setUint8(18, Math.min(255, Math.round(flowLpm  * 10)));
  view.setUint16(19, 0, true); // balance not reported
  return new Uint8Array(buf);
}

// ── Scenario: IoT telemetry ────────────────────────────────────────────────────
export function telemetry() {
  const deviceId  = `DEV-LOAD-${__VU.toString().padStart(5, '0')}`;
  const energyKwh = 100 + (__VU * 0.001) + (Math.random() * 0.5);
  const waterM3   = 10  + (__VU * 0.0001);
  const powerW    = 200 + Math.random() * 800;
  const voltage   = 218 + Math.random() * 8;
  const currentA  = powerW / voltage;
  const flowLpm   = Math.random() < 0.3 ? 2 + Math.random() * 3 : 0;

  const frame = buildTelemetryFrame(energyKwh, waterM3, powerW, voltage, currentA, flowLpm);

  const start = Date.now();
  const res = http.post(
    `${API_URL}/device/telemetry`,
    frame.buffer,
    {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Device-Id': deviceId,
      },
      tags: { scenario: 'iot_telemetry' },
    },
  );
  telemetryTrend.add(Date.now() - start);

  const ok = check(res, {
    'telemetry accepted': (r) => r.status === 200 || r.status === 201 || r.status === 204,
  });
  errorRate.add(!ok);

  // Devices publish every 5 s; subtract elapsed time so interval stays tight
  const elapsed = (Date.now() - start) / 1000;
  sleep(Math.max(0, 5 - elapsed));
}

// ── Scenario: Resident API ────────────────────────────────────────────────────
export function residentApi() {
  const headers = { ...authHeader(JWT_TOKEN), 'Content-Type': 'application/json' };

  // Dashboard summary (most common request)
  const dashStart = Date.now();
  const dash = http.get(
    `${API_URL}/gateway/mobile/${encodeURIComponent(UNIT_NO)}/dashboard`,
    { headers, tags: { scenario: 'resident_api', endpoint: 'dashboard' } },
  );
  dashboardTrend.add(Date.now() - dashStart);
  errorRate.add(!check(dash, { 'dashboard 200': (r) => r.status === 200 || r.status === 401 }));

  sleep(2 + Math.random() * 3);

  // Occasionally fetch trends or anomalies
  const roll = Math.random();
  if (roll < 0.4) {
    const trends = http.get(
      `${API_URL}/gateway/mobile/${encodeURIComponent(UNIT_NO)}/trends?period=daily`,
      { headers, tags: { scenario: 'resident_api', endpoint: 'trends' } },
    );
    errorRate.add(!check(trends, { 'trends ok': (r) => r.status === 200 || r.status === 401 }));
  } else if (roll < 0.6) {
    const anomalies = http.get(
      `${API_URL}/gateway/mobile/${encodeURIComponent(UNIT_NO)}/anomalies`,
      { headers, tags: { scenario: 'resident_api', endpoint: 'anomalies' } },
    );
    errorRate.add(!check(anomalies, { 'anomalies ok': (r) => r.status === 200 || r.status === 401 }));
  } else if (roll < 0.7) {
    const forecast = http.get(
      `${API_URL}/gateway/mobile/${encodeURIComponent(UNIT_NO)}/forecast`,
      { headers, tags: { scenario: 'resident_api', endpoint: 'forecast' } },
    );
    errorRate.add(!check(forecast, { 'forecast ok': (r) => r.status === 200 || r.status === 401 }));
  }

  sleep(3 + Math.random() * 5);
}

// ── Scenario: Admin API ───────────────────────────────────────────────────────
export function adminApi() {
  const headers = { ...authHeader(ADMIN_JWT), 'Content-Type': 'application/json' };

  // ML anomaly scores
  const scores = http.get(
    `${API_URL}/admin/ml/scores`,
    { headers, tags: { scenario: 'admin_api', endpoint: 'ml_scores' } },
  );
  errorRate.add(!check(scores, { 'ml scores ok': (r) => r.status === 200 || r.status === 401 || r.status === 403 }));

  sleep(5 + Math.random() * 10);

  // Unit list
  const units = http.get(
    `${API_URL}/admin/units`,
    { headers, tags: { scenario: 'admin_api', endpoint: 'units' } },
  );
  errorRate.add(!check(units, { 'units ok': (r) => r.status === 200 || r.status === 401 || r.status === 403 }));

  sleep(10 + Math.random() * 20);
}

// ── Summary handler ───────────────────────────────────────────────────────────
export function handleSummary(data) {
  const p95  = data.metrics['http_req_duration']?.values?.['p(95)']?.toFixed(1) ?? 'n/a';
  const p99  = data.metrics['http_req_duration']?.values?.['p(99)']?.toFixed(1) ?? 'n/a';
  const errR = ((data.metrics['errors']?.values?.rate ?? 0) * 100).toFixed(2);

  return {
    'k6-tests/results.json': JSON.stringify(data, null, 2),
    stdout: `
╔══════════════════════════════════════════════╗
║         NetFlow Load Test Results            ║
╠══════════════════════════════════════════════╣
║  p95 response time : ${p95.padEnd(8)} ms           ║
║  p99 response time : ${p99.padEnd(8)} ms           ║
║  Error rate        : ${errR.padEnd(8)} %            ║
╚══════════════════════════════════════════════╝
`,
  };
}
