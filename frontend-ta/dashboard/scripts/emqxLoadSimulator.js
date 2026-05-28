#!/usr/bin/env node
/**
 * EMQX Load Simulator - Spec 3 (broker ACK ratio and sampled E2E latency)
 *
 * Spawns N concurrent MQTT clients (default 2,444), each publishing one
 * 25-byte binary telemetry frame every INTERVAL_MS at QoS 1.
 *
 * Improvements over the earlier version:
 * - per-device publish jitter to avoid thundering herd bursts
 * - stable connection tracking across reconnects
 * - optional sampled E2E verification via backend history API
 *
 * Usage:
 *   node emqxLoadSimulator.js [units] [intervalMs]
 *
 * Defaults:
 *   units      = 2444
 *   intervalMs = 60000
 *
 * Optional env:
 *   LOAD_SIM_JITTER_MS=15000
 *   LOAD_SIM_SAMPLE_SIZE=5
 *   LOAD_SIM_HISTORY_URL_TEMPLATE=http://localhost:5000/api/custom-history/{deviceId}
 *
 * Interactive commands:
 *   stats
 *   stop
 */

'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const mqtt = require('mqtt');
const path = require('path');
const readline = require('readline');

const envPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const [keyPart, ...rest] = line.split('=');
    const key = (keyPart || '').trim();
    if (!key || key.startsWith('#') || process.env[key] !== undefined) return;
    process.env[key] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  });
}

const TOTAL_UNITS = parseInt(process.argv[2] || '2444', 10);
const INTERVAL_MS = parseInt(process.argv[3] || '60000', 10);
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 500;
const REPORT_MS = 30_000;
const JITTER_MS = parseInt(
  process.env.LOAD_SIM_JITTER_MS ||
    String(Math.min(15_000, Math.max(0, Math.floor(INTERVAL_MS / 3)))),
  10,
);
const SAMPLE_SIZE = parseInt(process.env.LOAD_SIM_SAMPLE_SIZE || '5', 10);
const HISTORY_URL_TEMPLATE = process.env.LOAD_SIM_HISTORY_URL_TEMPLATE || '';

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const USERNAME = process.env.MQTT_USERNAME || undefined;
const PASSWORD =
  process.env.MQTT_DEVICE_SECRET || process.env.MQTT_PASSWORD || undefined;

function encode(reading) {
  const buffer = Buffer.allocUnsafe(25);
  buffer.writeUInt32BE(Math.round(reading.et * 100), 0);
  buffer.writeUInt16BE(Math.round(reading.p * 10), 4);
  buffer.writeUInt16BE(Math.round(reading.v * 10), 6);
  buffer.writeUInt16BE(Math.round(reading.c * 1000), 8);
  buffer.writeUInt16BE(Math.round(reading.wf * 100), 10);
  buffer.writeUInt32BE(Math.round(reading.wt * 1000), 12);
  buffer.writeUInt32BE(Math.round(reading.te * 1000), 16);
  buffer.writeUInt32BE(Math.round(reading.tw * 1000), 20);
  buffer[24] = (reading.rs & 1) | ((reading.vs & 1) << 1);
  return buffer;
}

function deviceId(index) {
  // Assuming the DB has A-101 to A-xxx format.
  // We'll just generate DEV-A-101, DEV-A-102, etc.
  return `DEV-A-${index + 100}`; 
}

function nextReading(state) {
  const seconds = INTERVAL_MS / 1000;
  const power = 50 + Math.random() * 100;
  const waterFlow = 0.5 + Math.random() * 1.5;
  state.et += (power * seconds) / 3_600_000;
  state.wt += (waterFlow * seconds) / 60_000;
  return {
    et: state.et,
    p: power,
    v: 220 + (Math.random() * 5 - 2.5),
    c: power / 220,
    wf: waterFlow,
    wt: state.wt,
    te: 50,
    tw: 10,
    rs: 1,
    vs: 1,
  };
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(parsed, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        if ((res.statusCode || 500) >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
  });
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio));
  return sorted[index];
}

const clients = new Map();
const e2eStats = {
  enabled: SAMPLE_SIZE > 0 && Boolean(HISTORY_URL_TEMPLATE),
  sampleIndices: new Set(),
  pendingByDevice: new Map(),
  total: 0,
  ok: 0,
  timeouts: 0,
  latenciesMs: [],
};

let sent = 0;
let acked = 0;
let running = true;
let reporterTimer = null;
let cli = null;

function getConnectedCount() {
  let count = 0;
  for (const entry of clients.values()) {
    if (entry.isOnline) count++;
  }
  return count;
}

function createSampleIndices() {
  if (!e2eStats.enabled || TOTAL_UNITS <= 0) return;
  const target = Math.min(SAMPLE_SIZE, TOTAL_UNITS);
  while (e2eStats.sampleIndices.size < target) {
    e2eStats.sampleIndices.add(1 + Math.floor(Math.random() * TOTAL_UNITS));
  }
}

async function fetchLatestHistory(device) {
  const url = HISTORY_URL_TEMPLATE.replace(
    '{deviceId}',
    encodeURIComponent(device),
  );
  const rows = await httpGetJson(url);
  return Array.isArray(rows) ? rows : [];
}

async function verifySample(device, publishedAt) {
  const deadline = Date.now() + Math.max(60_000, INTERVAL_MS);
  const pollMs = 2_000;
  e2eStats.total++;

  while (Date.now() < deadline && running) {
    try {
      const rows = await fetchLatestHistory(device);
      const latest = rows[0];
      if (latest && latest.time) {
        const observedAt = new Date(latest.time).getTime();
        if (Number.isFinite(observedAt) && observedAt >= publishedAt) {
          e2eStats.ok++;
          e2eStats.latenciesMs.push(observedAt - publishedAt);
          return;
        }
      }
    } catch {
      // Best-effort probe; transient API issues should not stop the load run.
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  e2eStats.timeouts++;
}

function maybeScheduleE2ECheck(index, publishedAt) {
  if (!e2eStats.enabled || !e2eStats.sampleIndices.has(index)) return;
  const device = deviceId(index);
  if (e2eStats.pendingByDevice.has(device)) return;

  const task = verifySample(device, publishedAt)
    .catch(() => {
      e2eStats.timeouts++;
    })
    .finally(() => {
      e2eStats.pendingByDevice.delete(device);
    });

  e2eStats.pendingByDevice.set(device, task);
}

function publishOnce(index, entry) {
  if (!running || !entry.client.connected) return;
  const frame = encode(nextReading(entry.state));
  const publishedAt = Date.now();
  sent++;
  entry.client.publish(
    `device/${deviceId(index)}/data`,
    frame,
    { qos: 1 },
    (error) => {
      if (!error) {
        acked++;
        maybeScheduleE2ECheck(index, publishedAt);
      }
    },
  );
}

function schedulePublishing(index, entry) {
  const initialDelay =
    JITTER_MS > 0 ? Math.floor(Math.random() * (JITTER_MS + 1)) : 0;

  const tick = () => {
    if (!running) return;
    publishOnce(index, entry);
    entry.loopTimer = setTimeout(tick, INTERVAL_MS);
  };

  entry.loopTimer = setTimeout(tick, initialDelay);
}

function connectBatch(start) {
  const end = Math.min(start + BATCH_SIZE, TOTAL_UNITS + 1);

  for (let index = start; index < end; index++) {
    const did = deviceId(index);
    const state = { et: Math.random() * 500, wt: Math.random() * 100 };
    const client = mqtt.connect(BROKER_URL, {
      clientId: `load-${did}-${Date.now().toString(36)}`,
      username: USERNAME,
      password: PASSWORD,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10_000,
      rejectUnauthorized: false,
    });

    const entry = {
      client,
      state,
      isOnline: false,
      loopTimer: null,
    };

    client.on('connect', () => {
      const wasOffline = !entry.isOnline;
      entry.isOnline = true;
      if (wasOffline) {
        const connected = getConnectedCount();
        if (connected % 200 === 0 || connected === TOTAL_UNITS) {
          process.stdout.write(`\r[CONNECT] ${connected}/${TOTAL_UNITS} online`);
        }
      }
    });

    client.on('error', () => {});
    client.on('offline', () => {
      entry.isOnline = false;
    });
    client.on('close', () => {
      entry.isOnline = false;
    });

    clients.set(index, entry);
    schedulePublishing(index, entry);
  }

  if (end <= TOTAL_UNITS) {
    setTimeout(() => connectBatch(end), BATCH_DELAY_MS);
  } else {
    console.log(
      `\n[READY] All ${TOTAL_UNITS} clients initialized. Starting telemetry loop with up to ${JITTER_MS} ms jitter.`,
    );
    startReporter();
    startCLI();
  }
}

function printStats() {
  const ackLoss = sent === 0 ? 0 : (((sent - acked) / sent) * 100).toFixed(2);
  const connected = getConnectedCount();
  const avgLatency =
    e2eStats.ok === 0 ? '-' : `${average(e2eStats.latenciesMs).toFixed(0)}ms`;
  const p95Latency =
    e2eStats.ok === 0
      ? '-'
      : `${percentile(e2eStats.latenciesMs, 0.95).toFixed(0)}ms`;
  const e2eSummary = e2eStats.enabled
    ? ` | E2E sampled: ok=${e2eStats.ok}/${e2eStats.total} timeout=${e2eStats.timeouts} avg=${avgLatency} p95=${p95Latency}`
    : '';

  console.log(
    `\n[STATS] Connected: ${connected}/${TOTAL_UNITS} | Sent: ${sent} | Acked: ${acked} | Broker ACK loss: ${ackLoss}%${e2eSummary}`,
  );
}

function startReporter() {
  reporterTimer = setInterval(() => {
    printStats();
  }, REPORT_MS);
}

function shutdown() {
  running = false;
  printStats();
  console.log('[STOP] Disconnecting all clients...');

  if (reporterTimer) clearInterval(reporterTimer);
  if (cli) cli.close();

  clients.forEach((entry) => {
    if (entry.loopTimer) clearTimeout(entry.loopTimer);
    try {
      entry.client.end(true);
    } catch {}
  });

  Promise.allSettled([...e2eStats.pendingByDevice.values()]).finally(() => {
    process.exit(0);
  });
}

function startCLI() {
  cli = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  console.log('\nCommands: stats | stop\n');
  cli.on('line', (line) => {
    switch (line.trim()) {
      case 'stats':
        printStats();
        break;
      case 'stop':
        shutdown();
        break;
      default:
        console.log('Unknown command. Use: stats | stop');
    }
  });
}

createSampleIndices();

console.log('------------------------------------------------------------');
console.log(' Load Simulator | Spec 3: broker ACK loss and sampled E2E ');
console.log('------------------------------------------------------------');
console.log(` Broker   : ${BROKER_URL}`);
console.log(` Units    : ${TOTAL_UNITS}`);
console.log(` Interval : ${INTERVAL_MS / 1000}s | QoS 1 | 25-byte binary`);
console.log(` Jitter   : up to ${JITTER_MS}ms`);
console.log(
  ` E2E URL  : ${HISTORY_URL_TEMPLATE || 'disabled (set LOAD_SIM_HISTORY_URL_TEMPLATE)'}`,
);
console.log(
  ` E2E sample size: ${e2eStats.enabled ? e2eStats.sampleIndices.size : 0}`,
);
console.log(` Report   : every ${REPORT_MS / 1000}s`);
console.log('------------------------------------------------------------\n');

connectBatch(1);
