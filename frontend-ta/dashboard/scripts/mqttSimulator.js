#!/usr/bin/env node
/**
 * MQTT Telemetry Simulator
 *
 * Publishes 21-byte binary frames to  device/{deviceId}/data
 * matching the exact wire protocol defined in binary-codec.ts.
 *
 * Usage:
 *   node mqttSimulator.js [deviceId] [intervalMs]
 *
 * Defaults:
 *   deviceId   = DEV-001
 *   intervalMs = 5000
 *
 * MQTT credentials are read from the project-root .env file.
 * Fallback: mqtt://localhost:1883 with no auth (EMQX allow-anonymous dev mode).
 */

const mqtt = require('mqtt');
const path = require('path');
const fs   = require('fs');

// ── Load .env from project root (three levels up from scripts/) ───────────────
const envPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const [key, ...rest] = line.split('=');
      const k = (key || '').trim();
      if (!k || k.startsWith('#') || process.env[k] !== undefined) return;
      process.env[k] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    });
}

const DEVICE_ID   = process.argv[2] || 'DEV-001';
const INTERVAL_MS = parseInt(process.argv[3] || '5000', 10);
const BROKER_URL  = process.env.MQTT_BROKER_URL  || 'mqtt://localhost:1883';
const USERNAME    = process.env.MQTT_USERNAME     || undefined;
const PASSWORD    = process.env.MQTT_DEVICE_SECRET || process.env.MQTT_PASSWORD || undefined;
const TOPIC       = `device/${DEVICE_ID}/data`;

// ── Binary encoder — mirrors backend/src/common/binary-codec.ts ──────────────
// Frame layout (21 bytes):
//   [0:3]  uint32 BE  energy_total kWh × 100
//   [4:5]  uint16 BE  power        W   × 10
//   [6:7]  uint16 BE  voltage      V   × 10
//   [8:9]  uint16 BE  current      A   × 1000
//   [10:11] uint16 BE water_flow   L/min × 100
//   [12:15] uint32 BE water_total  m³  × 1000
//   [16:19] uint32 BE balance      Rp  (integer)
//   [20]   uint8      flags  bit0=relay_status  bit1=valve_status
function encodeTelemetry(t) {
  const buf = Buffer.allocUnsafe(21);
  buf.writeUInt32BE(Math.round(t.et * 100),   0);
  buf.writeUInt16BE(Math.round(t.p  * 10),    4);
  buf.writeUInt16BE(Math.round(t.v  * 10),    6);
  buf.writeUInt16BE(Math.round(t.c  * 1000),  8);
  buf.writeUInt16BE(Math.round(t.wf * 100),  10);
  buf.writeUInt32BE(Math.round(t.wt * 1000), 12);
  buf.writeUInt32BE(Math.round(t.b),         16);
  buf[20] = (t.rs & 1) | ((t.vs & 1) << 1);
  return buf;
}

// ── Simulated device state (totals accumulate each interval) ─────────────────
const state = {
  et: 120.50,  // energy_total kWh  — non-zero baseline so delta calc works
  wt:  45.230, // water_total  m³
  b:   50000,  // balance      Rp
  rs:  1,      // relay on
  vs:  1,      // valve open
};

function nextReading() {
  const sec    = INTERVAL_MS / 1000;
  const powerW = 250 + Math.random() * 150;      // 250–400 W
  const flowLpm = 5  + Math.random() * 8;        // 5–13 L/min

  // Accumulate totals proportional to elapsed time
  state.et += (powerW / 1000) * (sec / 3600);          // kWh
  state.wt += (flowLpm / 1000) * (sec / 60);           // m³
  state.b   = Math.max(0, state.b - Math.round(
    powerW * sec * 0.001 + flowLpm * sec * 0.002
  ));

  return {
    et: state.et,
    p:  powerW,
    v:  220 + (Math.random() * 5 - 2.5),   // 217.5–222.5 V
    c:  powerW / 220,
    wf: flowLpm,
    wt: state.wt,
    b:  state.b,
    rs: state.rs,
    vs: state.vs,
  };
}

// ── Connect and publish ───────────────────────────────────────────────────────
console.log('────────────────────────────────────────');
console.log(`Broker   : ${BROKER_URL}`);
console.log(`Topic    : ${TOPIC}`);
console.log(`Interval : ${INTERVAL_MS} ms`);
console.log(`Auth     : ${USERNAME ? `user=${USERNAME}` : 'anonymous'}`);
console.log('────────────────────────────────────────');

const client = mqtt.connect(BROKER_URL, {
  clientId:  `sim-${DEVICE_ID}-${Date.now().toString(16)}`,
  username:  USERNAME,
  password:  PASSWORD,
  clean:     true,
  reconnectPeriod: 3000,
});

client.on('connect', () => {
  console.log('Connected. Publishing binary telemetry frames...\n');

  const tick = () => {
    const reading = nextReading();
    const frame   = encodeTelemetry(reading);

    client.publish(TOPIC, frame, { qos: 1 }, (err) => {
      if (err) { console.error(`Publish failed: ${err.message}`); return; }
      console.log(
        `[${new Date().toISOString()}]  ${frame.length}B → ${TOPIC}` +
        `  P=${reading.p.toFixed(1)}W` +
        `  V=${reading.v.toFixed(1)}V` +
        `  I=${reading.c.toFixed(3)}A` +
        `  ET=${reading.et.toFixed(3)}kWh` +
        `  WF=${reading.wf.toFixed(2)}L/min` +
        `  WT=${reading.wt.toFixed(3)}m³` +
        `  BAL=Rp${reading.b}`
      );
    });
  };

  tick();
  setInterval(tick, INTERVAL_MS);
});

client.on('error',     (err) => console.error('Error:', err.message));
client.on('offline',   ()    => console.warn('Broker unreachable — waiting to reconnect'));
client.on('reconnect', ()    => console.log('Reconnecting...'));
