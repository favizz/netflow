/**
 * verify-anomaly-prod.mjs
 * Smoke test for the Anomaly Module against a live backend.
 *
 * Usage:
 *   API_BASE=https://api.srusun.id ADMIN_TOKEN=<jwt> node verify-anomaly-prod.mjs
 *
 * Requires Node 18+ (native fetch).
 * Exit code 0 = all checks passed. Exit code 1 = one or more failures.
 */

const BASE = process.env.API_BASE ?? 'http://localhost:5000';
const TOKEN = process.env.ADMIN_TOKEN ?? '';

if (!TOKEN) {
  console.error('ERROR: ADMIN_TOKEN env var is required.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  [PASS] ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ─── Health ───────────────────────────────────────────────────────────────────

console.log('\n[1] Backend health');
try {
  const { status, body } = await get('/health/check');
  if (status === 200) ok('GET /health/check returns 200');
  else fail('GET /health/check', `status ${status}`);

  if (body && typeof body === 'object') ok('Health response is JSON object');
  else fail('Health response is JSON object');
} catch (err) {
  fail('GET /health/check', err.message);
}

// ─── Anomaly stats ────────────────────────────────────────────────────────────

console.log('\n[2] GET /anomaly/stats');
let stats = null;
try {
  const { status, body } = await get('/anomaly/stats');
  if (status === 200) ok('GET /anomaly/stats returns 200');
  else fail('GET /anomaly/stats', `status ${status}`);

  stats = body;
  if (typeof stats?.totalActive === 'number') ok('stats.totalActive is number');
  else fail('stats.totalActive is number', JSON.stringify(stats));

  if (typeof stats?.totalResolved === 'number') ok('stats.totalResolved is number');
  else fail('stats.totalResolved is number');

  if (stats?.countByType && typeof stats.countByType === 'object') ok('stats.countByType is object');
  else fail('stats.countByType is object');

  if (stats?.countBySeverity && typeof stats.countBySeverity === 'object') ok('stats.countBySeverity is object');
  else fail('stats.countBySeverity is object');

  // Verify no stale low_token type exists in the database
  if (!('low_token' in (stats?.countByType ?? {}))) ok('No stale low_token entries in DB (D-02 fixed)');
  else fail('Stale low_token entries still exist in DB — run migrate-anomaly-v2.sql');
} catch (err) {
  fail('GET /anomaly/stats', err.message);
}

// ─── Active anomalies ─────────────────────────────────────────────────────────

console.log('\n[3] GET /anomaly/active');
try {
  const { status, body } = await get('/anomaly/active?limit=5&page=1');
  if (status === 200) ok('GET /anomaly/active returns 200');
  else fail('GET /anomaly/active', `status ${status}`);

  if (typeof body?.total === 'number') ok('Response has numeric total');
  else fail('Response has numeric total', JSON.stringify(body));

  if (Array.isArray(body?.data)) ok('Response data is array');
  else fail('Response data is array');

  if (typeof body?.totalPages === 'number') ok('Response has totalPages');
  else fail('Response has totalPages');

  // Spot-check first record shape if any exist
  const first = body?.data?.[0];
  if (first) {
    const validTypes = [
      'jailbreak','water_leak','device_offline','mcb_trip',
      'low_electricity_token','low_water_token','voltage_anomaly',
      'sensor_malfunction','low_power_factor','usage_spike','zero_flow','backflow',
    ];
    if (validTypes.includes(first.type)) ok(`First record type "${first.type}" is a valid AnomalyType`);
    else fail(`First record type "${first.type}" is not a recognised AnomalyType`);

    if (first.resolved_at === null) ok('Active anomaly has resolved_at = null');
    else fail('Active anomaly resolved_at should be null', JSON.stringify(first.resolved_at));
  }
} catch (err) {
  fail('GET /anomaly/active', err.message);
}

// ─── History with filter ──────────────────────────────────────────────────────

console.log('\n[4] GET /anomaly/history (with severity filter)');
try {
  const { status, body } = await get('/anomaly/history?severity=critical&limit=10');
  if (status === 200) ok('GET /anomaly/history?severity=critical returns 200');
  else fail('GET /anomaly/history?severity=critical', `status ${status}`);

  const allCritical = (body?.data ?? []).every((r) => r.severity === 'critical');
  if (allCritical) ok('All returned records have severity=critical');
  else fail('Severity filter not applied — got non-critical records');
} catch (err) {
  fail('GET /anomaly/history', err.message);
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

console.log('\n[5] Auth guard on anomaly endpoints');
try {
  const res = await fetch(`${BASE}/anomaly/stats`); // no auth header
  if (res.status === 401) ok('GET /anomaly/stats without token returns 401');
  else fail('GET /anomaly/stats without token', `expected 401, got ${res.status}`);
} catch (err) {
  fail('Auth guard check', err.message);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (stats) {
  console.log(`\nAnomalies on prod:`);
  console.log(`  Active  : ${stats.totalActive}`);
  console.log(`  Resolved: ${stats.totalResolved}`);
  if (Object.keys(stats.countByType ?? {}).length > 0) {
    console.log(`  By type :`);
    for (const [type, count] of Object.entries(stats.countByType)) {
      console.log(`    ${type.padEnd(25)} ${count}`);
    }
  }
}

process.exit(failed > 0 ? 1 : 0);
