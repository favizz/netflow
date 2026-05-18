#!/usr/bin/env node
/**
 * EMQX Load Simulator — Spec 3 (PLR & E2E Latency)
 *
 * Spawns N concurrent MQTT clients (default 2,444), each publishing one
 * 21-byte binary telemetry frame every INTERVAL_MS at QoS 1.
 * Tracks packet-loss ratio and reports stats every REPORT_INTERVAL_MS.
 *
 * Usage:
 *   node emqxLoadSimulator.js [units] [intervalMs]
 *
 * Defaults:
 *   units      = 2444
 *   intervalMs = 60000  (1 frame/min — matches device firmware)
 *
 * Reads broker credentials from project-root .env (fallback: anonymous).
 *
 * Interactive commands (type + Enter):
 *   stats    — print current PLR and connection count
 *   stop     — graceful shutdown
 */

'use strict';
const mqtt = require('mqtt');
const readline = require('readline');
const path = require('path');
const fs   = require('fs');

// Load .env from repo root (3 levels up: scripts/ -> dashboard/ -> frontend-ta/ -> root)
const envPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const [k, ...rest] = line.split('=');
    const key = (k || '').trim();
    if (!key || key.startsWith('#') || process.env[key] !== undefined) return;
    process.env[key] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  });
}

const TOTAL_UNITS    = parseInt(process.argv[2] || '2444', 10);
const INTERVAL_MS    = parseInt(process.argv[3] || '60000', 10);
const BATCH_SIZE     = 50;
const BATCH_DELAY_MS = 500;
const REPORT_MS      = 30_000;

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const USERNAME   = process.env.MQTT_USERNAME   || undefined;
const PASSWORD   = process.env.MQTT_DEVICE_SECRET || process.env.MQTT_PASSWORD || undefined;

// 21-byte binary frame — matches backend binary-codec.ts
function encode(t) {
  const b = Buffer.allocUnsafe(21);
  b.writeUInt32BE(Math.round(t.et * 100),   0);
  b.writeUInt16BE(Math.round(t.p  * 10),    4);
  b.writeUInt16BE(Math.round(t.v  * 10),    6);
  b.writeUInt16BE(Math.round(t.c  * 1000),  8);
  b.writeUInt16BE(Math.round(t.wf * 100),  10);
  b.writeUInt32BE(Math.round(t.wt * 1000), 12);
  b.writeUInt32BE(Math.round(t.b),         16);
  b[20] = (t.rs & 1) | ((t.vs & 1) << 1);
  return b;
}

function deviceId(i)  { return `SMART-METER-${String(i).padStart(4, '0')}`; }
function unitNo(i)    { return `A-${String(i).padStart(4, '0')}`; }

const clients = new Map();  // index -> { client, state }
let sent = 0, acked = 0, connected = 0;
let running = true;

function nextReading(s) {
  const sec = INTERVAL_MS / 1000;
  const p   = 50 + Math.random() * 100;
  const wf  = 0.5 + Math.random() * 1.5;
  s.et += p * sec / 3_600_000;
  s.wt += wf * sec / 60_000;
  return { et: s.et, p, v: 220 + (Math.random() * 5 - 2.5), c: p / 220,
           wf, wt: s.wt, b: 50000, rs: 1, vs: 1 };
}

function connectBatch(start) {
  const end = Math.min(start + BATCH_SIZE, TOTAL_UNITS + 1);
  for (let i = start; i < end; i++) {
    const did   = deviceId(i);
    const topic = `device/${did}/data`;
    const state = { et: Math.random() * 500, wt: Math.random() * 100 };

    const client = mqtt.connect(BROKER_URL, {
      clientId: `load-${did}-${Date.now().toString(36)}`,
      username: USERNAME,
      password: PASSWORD,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10_000,
    });

    client.on('connect', () => {
      connected++;
      clients.set(i, { client, state });
      if (connected % 200 === 0 || connected === TOTAL_UNITS) {
        process.stdout.write(`\r[CONNECT] ${connected}/${TOTAL_UNITS} online`);
      }
    });

    client.on('error', () => {});  // suppress per-client noise; track via PLR
    client.on('offline', () => { connected = Math.max(0, connected - 1); });

    clients.set(i, { client, state });
  }
  if (end <= TOTAL_UNITS) {
    setTimeout(() => connectBatch(end), BATCH_DELAY_MS);
  } else {
    console.log(`\n[READY] All ${TOTAL_UNITS} clients initialized. Starting telemetry loop.`);
    startLoop();
    startReporter();
    startCLI();
  }
}

function startLoop() {
  setInterval(() => {
    if (!running) return;
    for (const [i, { client, state }] of clients) {
      if (!client.connected) continue;
      const frame = encode(nextReading(state));
      sent++;
      client.publish(`device/${deviceId(i)}/data`, frame, { qos: 1 }, (err) => {
        if (!err) acked++;
      });
    }
  }, INTERVAL_MS);
}

function startReporter() {
  setInterval(() => {
    const plr = sent === 0 ? 0 : ((sent - acked) / sent * 100).toFixed(2);
    const conn = [...clients.values()].filter(c => c.client.connected).length;
    console.log(`\n[STATS] Connected: ${conn}/${TOTAL_UNITS} | Sent: ${sent} | Acked: ${acked} | PLR: ${plr}% (limit <1%)`);
  }, REPORT_MS);
}

function printStats() {
  const plr  = sent === 0 ? 0 : ((sent - acked) / sent * 100).toFixed(2);
  const conn = [...clients.values()].filter(c => c.client.connected).length;
  console.log(`\n[STATS] Connected: ${conn}/${TOTAL_UNITS} | Sent: ${sent} | Acked: ${acked} | PLR: ${plr}% (spec limit <1.00%)`);
}

function startCLI() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\nCommands: stats | stop\n');
  rl.on('line', (line) => {
    switch (line.trim()) {
      case 'stats': printStats(); break;
      case 'stop':
        running = false;
        printStats();
        console.log('[STOP] Disconnecting all clients...');
        clients.forEach(({ client }) => { try { client.end(true); } catch {} });
        process.exit(0);
      default:
        console.log('Unknown command. Use: stats | stop');
    }
  });
}

console.log('────────────────────────────────────────────────────────────');
console.log(` Load Simulator  |  Spec 3: PLR < 1%, E2E latency < 60s`);
console.log(`────────────────────────────────────────────────────────────`);
console.log(` Broker   : ${BROKER_URL}`);
console.log(` Units    : ${TOTAL_UNITS}`);
console.log(` Interval : ${INTERVAL_MS / 1000}s  |  QoS 1  |  21-byte binary`);
console.log(` Report   : every ${REPORT_MS / 1000}s`);
console.log('────────────────────────────────────────────────────────────\n');

connectBatch(1);
