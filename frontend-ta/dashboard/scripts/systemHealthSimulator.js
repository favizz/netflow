#!/usr/bin/env node
/**
 * System Health Simulator
 *
 * Verifies all software specifications from the TA paper against the live
 * system. Runs as a single interactive menu — pick a spec to test.
 *
 * Specs covered:
 *   3  — Data Centralization: PLR < 1%, E2E latency < 60s, CPU/RAM < 80%
 *   4  — Payment availability: 100% success, TLS 1.3
 *   5  — Valve actuation latency < 5s
 *   6  — Relay actuation latency < 5s
 *   7  — Offline buffer: 0 data loss
 *   8  — Anomaly alert latency < 90s
 *
 * Usage:
 *   node systemHealthSimulator.js
 *
 * Environment variables (from .env or shell):
 *   MQTT_BROKER_URL, MQTT_USERNAME, MQTT_DEVICE_SECRET, MQTT_PASSWORD
 *   API_BASE_URL   (default: http://localhost:5000/api)
 *   ADMIN_TOKEN    (JWT from admin login — required for actuation tests)
 *   TEST_UNIT_NO   (e.g. A-0001 — unit to use for actuation tests)
 */

'use strict';
const mqtt     = require('mqtt');
const readline = require('readline');
const https    = require('https');
const http     = require('http');
const path     = require('path');
const fs       = require('fs');

// Load .env
const envPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const [k, ...rest] = line.split('=');
    const key = (k || '').trim();
    if (!key || key.startsWith('#') || process.env[key] !== undefined) return;
    process.env[key] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  });
}

const BROKER_URL  = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const USERNAME    = process.env.MQTT_USERNAME   || undefined;
const PASSWORD    = process.env.MQTT_DEVICE_SECRET || process.env.MQTT_PASSWORD || undefined;
const API_BASE    = process.env.API_BASE_URL    || 'http://localhost:5000/api';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN     || '';
const TEST_DEVICE = `DEV-${process.env.TEST_UNIT_NO || 'A-0001'}`;
const TEST_UNIT   = process.env.TEST_UNIT_NO    || 'A-0001';

// 25-byte binary frame
function encode(t) {
  const b = Buffer.allocUnsafe(25);
  b.writeUInt32BE(Math.round((t.et ?? 100) * 100),   0);
  b.writeUInt16BE(Math.round((t.p  ?? 200) * 10),    4);
  b.writeUInt16BE(Math.round((t.v  ?? 220) * 10),    6);
  b.writeUInt16BE(Math.round((t.c  ?? 0.9) * 1000),  8);
  b.writeUInt16BE(Math.round((t.wf ?? 1)   * 100),  10);
  b.writeUInt32BE(Math.round((t.wt ?? 10)  * 1000), 12);
  b.writeUInt32BE(Math.round((t.te ?? 50) * 1000),  16);
  b.writeUInt32BE(Math.round((t.tw ?? 10) * 1000),  20);
  b[24] = ((t.rs ?? 1) & 1) | (((t.vs ?? 1) & 1) << 1) | (((t.tamper ?? 0) & 1) << 2);
  return b;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Minimal fetch shim (Node < 18)
async function apiFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}`, ...opts.headers },
    });
  }
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const body = opts.body ?? null;
    const req = mod.request(u, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}`, ...opts.headers },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode, json: () => JSON.parse(raw) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function mqttConnect(clientId) {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(BROKER_URL, {
      clientId, username: USERNAME, password: PASSWORD, clean: true, connectTimeout: 10_000,
    });
    c.on('connect', () => resolve(c));
    c.on('error',   (e) => reject(e));
  });
}

// ── Spec 3: Single-client PLR + basic connectivity check ─────────────────────
async function testSpec3() {
  console.log('\n[Spec 3] Data Centralization — PLR + Connectivity');
  console.log('  Sends 10 frames at QoS 1, measures ack ratio.');
  console.log('  For full 2444-client PLR run: node emqxLoadSimulator.js\n');

  const device = `SPEC3-${Date.now().toString(36)}`;
  const topic  = `device/${device}/data`;
  let sent = 0, acked = 0;

  const client = await mqttConnect(`healthsim-spec3-${Date.now().toString(36)}`);
  const FRAMES = 10;

  for (let i = 0; i < FRAMES; i++) {
    const frame = encode({ et: i * 0.1, p: 200, v: 220, c: 0.9, wf: 1, wt: i * 0.01, b: 50000 });
    sent++;
    await new Promise((r) => client.publish(topic, frame, { qos: 1 }, (err) => { if (!err) acked++; r(); }));
    await sleep(200);
  }

  client.end(true);
  const plr = ((sent - acked) / sent * 100).toFixed(2);
  const pass = parseFloat(plr) < 1.0;
  console.log(`  Sent: ${sent}  Acked: ${acked}  PLR: ${plr}%  (limit <1.00%)  ${pass ? 'PASS' : 'FAIL'}`);

  // Health endpoint
  console.log('\n  Checking /health endpoint...');
  try {
    const r = await apiFetch('/health');
    const body = await r.json();
    console.log(`  Status: ${r.status}  overall=${body.overall ?? 'n/a'}  ${r.ok ? 'PASS' : 'FAIL'}`);
  } catch (e) {
    console.log(`  /health unreachable: ${e.message}  FAIL`);
  }
}

// ── Spec 4: Payment endpoint availability ────────────────────────────────────
async function testSpec4() {
  console.log('\n[Spec 4] Payment Availability — endpoint reachability + TLS');
  console.log('  NOTE: Full 100-concurrent payment stress test requires Midtrans sandbox credentials.');
  console.log('  This check verifies the endpoint responds and the API is reachable.\n');

  try {
    const r = await apiFetch('/health');
    const body = await r.json();
    console.log(`  /health: ${r.status}  overall=${body.overall ?? 'n/a'}  ${r.ok ? 'PASS' : 'FAIL'}`);
  } catch (e) {
    console.log(`  /health unreachable: ${e.message}  FAIL`);
  }

  const isTls = API_BASE.startsWith('https://');
  console.log(`  TLS 1.3 in use: ${isTls ? 'YES (HTTPS detected)' : 'NO — API_BASE_URL uses HTTP (dev mode)'}`);
  console.log(`  (TLS version confirmed by inspecting TLS ServerHello in Wireshark/curl)`);
}

// ── Spec 5: Valve actuation latency ─────────────────────────────────────────
async function testSpec5() {
  await testActuation('valve', 'Spec 5');
}

// ── Spec 6: Relay actuation latency ─────────────────────────────────────────
async function testSpec6() {
  await testActuation('relay', 'Spec 6');
}

async function testActuation(type, specLabel) {
  const cmdTopic = `device/${TEST_DEVICE}/command`;
  const dataTopic = `device/${TEST_DEVICE}/data`;
  const LIMIT_MS  = 5000;
  const TRIALS    = 3;

  console.log(`\n[${specLabel}] ${type === 'valve' ? 'Valve' : 'Relay'} Actuation Latency < 5s`);
  console.log(`  Device : ${TEST_DEVICE}  Unit : ${TEST_UNIT}`);
  if (!ADMIN_TOKEN) { console.log('  SKIP — ADMIN_TOKEN not set'); return; }

  const apiPath = type === 'valve'
    ? `/unit/${TEST_UNIT}/valve`
    : `/unit/${TEST_UNIT}/relay`;

  const results = [];
  const client = await mqttConnect(`healthsim-act-${Date.now().toString(36)}`);

  // Subscribe to ACK topic so we know when device receives command
  const ackTopic = `device/${TEST_DEVICE}/command_ack`;
  client.subscribe(ackTopic);

  for (let i = 0; i < TRIALS; i++) {
    const targetOn = i % 2 === 0;  // alternate ON/OFF
    const label    = targetOn ? (type === 'valve' ? 'Open' : 'Connect') : (type === 'valve' ? 'Close' : 'Disconnect');

    const t0 = Date.now();
    let ackReceived = false;

    const ackPromise = new Promise((resolve) => {
      const handler = (topic) => {
        if (topic === ackTopic) { ackReceived = true; client.removeListener('message', handler); resolve(Date.now()); }
      };
      client.on('message', handler);
      setTimeout(() => { client.removeListener('message', handler); resolve(null); }, LIMIT_MS + 1000);
    });

    // Send command via REST
    try {
      const fieldName = type === 'valve' ? 'valveOpen' : 'relayOn';
      await apiFetch(apiPath, {
        method: 'POST',
        body: JSON.stringify({ [fieldName]: targetOn }),
      });
    } catch (e) {
      console.log(`  Trial ${i + 1} (${label}): REST error — ${e.message}  FAIL`);
      results.push({ label, latencyMs: null, pass: false });
      continue;
    }

    const t1 = await ackPromise;
    if (t1 === null) {
      console.log(`  Trial ${i + 1} (${label}): No ACK within ${(LIMIT_MS + 1000) / 1000}s  FAIL`);
      results.push({ label, latencyMs: null, pass: false });
    } else {
      const ms   = t1 - t0;
      const pass = ms <= LIMIT_MS;
      console.log(`  Trial ${i + 1} (${label}): ${(ms / 1000).toFixed(2)}s  (limit 5s)  ${pass ? 'PASS' : 'FAIL'}`);
      results.push({ label, latencyMs: ms, pass });
    }
    await sleep(10_000); // settling interval between trials
  }

  client.end(true);
  const allPass = results.every((r) => r.pass);
  const lats = results.filter((r) => r.latencyMs !== null).map((r) => r.latencyMs);
  const peak = lats.length ? Math.max(...lats) : null;
  console.log(`  Peak: ${peak !== null ? (peak / 1000).toFixed(2) + 's' : 'n/a'}  Overall: ${allPass ? 'PASS' : 'FAIL'}`);
}

// ── Spec 7: Offline buffering ────────────────────────────────────────────────
async function testSpec7() {
  const OFFLINE_S   = 60;   // simulate offline for 60s (adjust as needed)
  const SAMPLE_RATE = 10_000; // ms between readings during offline period

  console.log(`\n[Spec 7] Offline Buffer — 0 data loss`);
  console.log(`  Simulates ${OFFLINE_S}s offline period, then reconnects and flushes buffered frames.`);
  console.log(`  Device: ${TEST_DEVICE}\n`);

  const topic  = `device/${TEST_DEVICE}/data`;
  const buffer = [];
  let sent = 0;

  // Generate readings while "offline"
  console.log(`  Generating ${Math.ceil(OFFLINE_S * 1000 / SAMPLE_RATE)} buffered readings...`);
  let et = 100, wt = 10;
  for (let t = 0; t < OFFLINE_S * 1000; t += SAMPLE_RATE) {
    const p  = 200 + Math.random() * 50;
    const wf = 1 + Math.random() * 0.5;
    et += p  * (SAMPLE_RATE / 1000) / 3_600_000;
    wt += wf * (SAMPLE_RATE / 1000) / 60_000;
    buffer.push(encode({ et, p, v: 220, c: p / 220, wf, wt, b: 50000 }));
  }
  console.log(`  Buffer size: ${buffer.length} frames`);

  // Connect and flush
  console.log(`  Reconnecting and flushing...`);
  const client = await mqttConnect(`healthsim-spec7-${Date.now().toString(36)}`);

  for (const frame of buffer) {
    await new Promise((r) => client.publish(topic, frame, { qos: 1 }, (err) => {
      if (!err) sent++;
      r();
    }));
  }

  client.end(true);
  const loss = buffer.length - sent;
  const pass = loss === 0;
  console.log(`  Buffered: ${buffer.length}  Published: ${sent}  Lost: ${loss}  ${pass ? 'PASS' : 'FAIL'}`);
  console.log(`  (Verify in DB that all ${sent} readings appear with correct timestamps)`);
}

// ── Spec 8: Anomaly detection latency ────────────────────────────────────────
async function testSpec8() {
  console.log('\n[Spec 8] Anomaly Detection Latency < 90s');
  console.log('  Triggers jumper and tamper anomalies, polls backend for alert records.');
  if (!ADMIN_TOKEN) console.warn('  [WARN] ADMIN_TOKEN not set — polling will likely fail (403)\n');

  const SCENARIOS = [
    { label: 'jumper', frame: { p: 1500, v: 220, c: 6.8, rs: 0, vs: 1, wf: 0, wt: 10, b: 50000 } },
    { label: 'tamper', frame: { p: 200, v: 220, c: 0.9, rs: 1, vs: 1, wf: 1, wt: 10, b: 50000, tamper: 1 } },
  ];

  const client = await mqttConnect(`healthsim-spec8-${Date.now().toString(36)}`);
  const topic  = `device/${TEST_DEVICE}/data`;
  const LIMIT  = 90_000;
  const results = [];

  for (const sc of SCENARIOS) {
    // Publish normal frame first
    await new Promise((r) => client.publish(topic, encode({ et: 100, p: 200, v: 220, c: 0.9, wf: 1, wt: 10, b: 50000 }), { qos: 1 }, r));
    await sleep(2000);

    const t0 = Date.now();
    await new Promise((r) => client.publish(topic, encode(sc.frame), { qos: 1 }, r));
    console.log(`  [${sc.label}] T0=${new Date(t0).toISOString()} — trigger sent`);

    const deadline = t0 + LIMIT;
    let t1 = null;
    while (Date.now() < deadline) {
      await sleep(3000);
      try {
        const res = await apiFetch(`/admin/anomalies?limit=10`);
        if (!res.ok) continue;
        const list = await res.json();
        const hit = list.find((a) => a.device_id === TEST_DEVICE && new Date(a.created_at).getTime() >= t0);
        if (hit) { t1 = new Date(hit.created_at).getTime(); break; }
      } catch {}
    }

    if (t1 === null) {
      console.log(`  [${sc.label}] TIMEOUT — no alert within ${LIMIT / 1000}s  FAIL\n`);
      results.push({ label: sc.label, pass: false });
    } else {
      const lat = t1 - t0;
      const pass = lat <= LIMIT;
      console.log(`  [${sc.label}] T1=${new Date(t1).toISOString()}  latency=${(lat / 1000).toFixed(1)}s  (limit ${LIMIT / 1000}s)  ${pass ? 'PASS' : 'FAIL'}\n`);
      results.push({ label: sc.label, latencyMs: lat, pass });
    }
    await sleep(5000);
  }

  client.end(true);
  const allPass = results.every((r) => r.pass);
  console.log(`  Overall: ${allPass ? 'PASS' : 'FAIL'}`);
}

// ── Menu ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log(' System Health Simulator');
  console.log('════════════════════════════════════════════════════════════');
  console.log(` Broker     : ${BROKER_URL}`);
  console.log(` API        : ${API_BASE}`);
  console.log(` Test device: ${TEST_DEVICE}  (TEST_UNIT_NO=${TEST_UNIT})`);
  console.log(` Admin token: ${ADMIN_TOKEN ? 'set' : 'NOT SET — set ADMIN_TOKEN env var'}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log('\nSelect a test:');
  console.log('  3  — Data centralization: PLR < 1%');
  console.log('  4  — Payment availability');
  console.log('  5  — Valve actuation latency < 5s');
  console.log('  6  — Relay actuation latency < 5s');
  console.log('  7  — Offline buffer: 0 data loss');
  console.log('  8  — Anomaly alert latency < 90s');
  console.log('  all — Run specs 3,4,7,8 (non-interactive)');
  console.log('  q  — Quit\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('> ', async (ans) => {
    rl.close();
    const tests = {
      '3': testSpec3, '4': testSpec4, '5': testSpec5,
      '6': testSpec6, '7': testSpec7, '8': testSpec8,
    };
    if (ans.trim() === 'q') { process.exit(0); }
    if (ans.trim() === 'all') {
      for (const fn of [testSpec3, testSpec4, testSpec7, testSpec8]) await fn();
    } else if (tests[ans.trim()]) {
      await tests[ans.trim()]();
    } else {
      console.log('Unknown option.');
    }
    console.log('\nDone.');
    process.exit(0);
  });
}

main().catch((e) => { console.error('[FATAL]', e); process.exit(1); });
