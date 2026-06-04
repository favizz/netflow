#!/usr/bin/env node
/**
 * Single Device Simulator
 * Dev/QA tool: simulates one meter publishing 25-byte binary telemetry frames.
 * Supports interactive anomaly injection (overvoltage, overcurrent, leakage,
 * tamper, trip) and listens for relay/valve commands from the backend.
 *
 * Specs covered: 5 (relay actuation), 6 (valve actuation), 8 (anomaly triggers)
 *
 * Usage: node singleDeviceSimulator.js [UNIT_NO] [BROKER_URL]
 * Example: node singleDeviceSimulator.js A-0001 mqtt://localhost:1883
 */
const mqtt = require('mqtt');
const readline = require('readline');
const fs = require('fs');
const path = require('path');


// Simple .env parser — handles values that contain '=' (e.g. base64 strings)
function loadEnv() {
    const envPath = path.resolve(__dirname, '../../../.env');
    if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
            const [k, ...rest] = line.split('=');
            const key = (k || '').trim();
            if (!key || key.startsWith('#') || process.env[key] !== undefined) return;
            process.env[key] = rest.join('=').trim().replace(/^["']|["']$/g, '');
        });
    }
}
loadEnv();

const rawUnit = process.argv[2] || 'A-101';
const UNIT_NO = rawUnit;
const DEVICE_ID = `DEV-${UNIT_NO}`;
const BROKER_URL = process.env.MQTT_BROKER_URL || process.argv[3] || 'mqtt://localhost:1883';
// Devices authenticate with device_id as username and MQTT_DEVICE_SECRET as password
const USERNAME   = DEVICE_ID;
const PASSWORD   = process.env.MQTT_DEVICE_SECRET || undefined;
const INTERVAL_MS = 2000;

console.log('====================================================');
console.log(`🔌 Single Device Simulator`);
console.log(`   Unit: ${UNIT_NO} | Device: ${DEVICE_ID}`);
console.log(`   Broker: ${BROKER_URL}`);
console.log(`   Auth: username=${USERNAME} password=${PASSWORD ? '***set***' : 'NOT SET'}`);
console.log(`   Interval: ${INTERVAL_MS / 1000}s`);
console.log('====================================================\n');

// 25-byte binary protocol matching binary-codec.ts
//   [0:3]  uint32 BE  et × 100     energy_total (kWh)
//   [4:5]  uint16 BE  p  × 10      power (W)
//   [6:7]  uint16 BE  v  × 10      voltage (V)
//   [8:9]  uint16 BE  c  × 1000    current (A)
//   [10:11] uint16 BE wf × 100     water_flow (L/min)
//   [12:15] uint32 BE wt × 1000    water_total (m³)
//   [16:19] uint32 BE te × 1000    electricity token remaining (kWh)
//   [20:23] uint32 BE tw × 1000    water token remaining (m3)
//   [24]    uint8     flags        bit0=relay, bit1=valve
function encodeTelemetry(t) {
    const buf = Buffer.allocUnsafe(25);
    buf.writeUInt32BE(Math.round(t.et * 100), 0);
    buf.writeUInt16BE(Math.round(t.p * 10), 4);
    buf.writeUInt16BE(Math.round(t.v * 10), 6);
    buf.writeUInt16BE(Math.round(t.c * 1000), 8);
    buf.writeUInt16BE(Math.round(t.wf * 100), 10);
    buf.writeUInt32BE(Math.round(t.wt * 1000), 12);
    buf.writeUInt32BE(Math.round((t.te ?? t.b ?? 0) * 1000), 16);
    buf.writeUInt32BE(Math.round((t.tw ?? 0) * 1000), 20);
    buf[24] = (t.rs & 1) | ((t.vs & 1) << 1);
    return buf;
}

const state = {
    energyTotal: 5952.00, // kWh — start near seeded baseline so delta is visible immediately
    waterTotal: 368.50,   // m³
    elecTokenKwh: 68.966,
    waterTokenM3: 20.000,
    relayOn: true,
    valveOpen: true,
    anomaly: null,
};

const client = mqtt.connect(BROKER_URL, {
    clientId: `single-sim-${DEVICE_ID}-${Date.now().toString(36)}`,
    username: USERNAME,
    password: PASSWORD,
    clean: true,
    rejectUnauthorized: false,
});

const generatePayload = () => {
    // Higher ranges so energy/water totals visibly increment each frame at 2s intervals.
    // At 1000 W × 2 s → 0.00056 kWh delta; encoding precision is 0.01 kWh, so ~18 frames
    // before the column changes. Raising to ~2500 W peak gives a change roughly every 7 frames.
    let power = Math.random() * 2000 + 500;  // 500–2500 W (realistic apartment peak)
    let voltage = Math.random() * 5 + 218;   // 218–223 V
    let flowRate = Math.random() * 4 + 2;    // 2–6 L/min (shower / washing machine range)

    if (state.anomaly) {
        switch (state.anomaly) {
            case 'overvoltage':  voltage = 260.5; break;
            case 'undervoltage': voltage = 160.0; break;
            case 'overcurrent':  power = 3000; break;
            case 'leakage':      flowRate = 50.0; break;
            case 'trip':         state.relayOn = false; power = 10; break;
        }
    }

    if (!state.relayOn && state.anomaly !== 'trip') power = 0;
    if (!state.valveOpen) flowRate = 0;

    // Accumulate totals using correct time-based formulas:
    //   energy (kWh) = power (W) × time (s) / 3_600_000
    //   water  (m³)  = flow (L/min) × time (s) / 60_000
    const intervalSec = INTERVAL_MS / 1000;
    state.energyTotal += power * intervalSec / 3_600_000;
    state.waterTotal  += flowRate * intervalSec / 60_000;

    return {
        et: parseFloat(state.energyTotal.toFixed(4)),
        p:  parseFloat(power.toFixed(2)),
        v:  parseFloat(voltage.toFixed(2)),
        c:  parseFloat((power / voltage).toFixed(3)),
        wf: parseFloat(flowRate.toFixed(2)),
        wt: parseFloat(state.waterTotal.toFixed(6)),
        te: parseFloat(state.elecTokenKwh.toFixed(3)),
        tw: parseFloat(state.waterTokenM3.toFixed(3)),
        rs: state.relayOn ? 1 : 0,
        vs: state.valveOpen ? 1 : 0,
    };
};

client.on('connect', () => {
    console.log(`✅ Connected as ${DEVICE_ID}\n`);

    client.subscribe(`device/${DEVICE_ID}/command`);

    setInterval(() => {
        const payload = generatePayload();
        client.publish(`device/${DEVICE_ID}/data`, encodeTelemetry(payload), { qos: 0 });
        process.stdout.write(
            `\r📡 v=${payload.v}V p=${payload.p}W wf=${payload.wf}L/min et=${payload.et}kWh te=${payload.te}kWh tw=${payload.tw}m3 | Anomaly: ${state.anomaly || 'none'}   `
        );
    }, INTERVAL_MS);

    console.log('Commands: overvoltage | undervoltage | overcurrent | leakage | trip | normal\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', (input) => {
        const cmd = input.trim().toLowerCase();
        if (cmd === 'normal') {
            state.anomaly = null;
            state.relayOn = true;
            console.log(`\n✅ Kembali ke kondisi normal`);
        } else if (['overvoltage', 'undervoltage', 'overcurrent', 'leakage', 'trip'].includes(cmd)) {
            state.anomaly = cmd;
            console.log(`\n🚨 Triggering: ${cmd.toUpperCase()}`);
            const payload = generatePayload();
            client.publish(`device/${DEVICE_ID}/data`, encodeTelemetry(payload), { qos: 0 });
        } else {
            console.log(`\n❌ Unknown: ${cmd}`);
        }
    });
});

client.on('message', (topic, message) => {
    if (topic === `device/${DEVICE_ID}/command` && message.length === 1) {
        const type = (message[0] >> 4) & 0x0F;
        const val  = message[0] & 0x0F;
        const typeStr = type === 1 ? 'relay' : type === 2 ? 'valve' : 'unknown';

        if (type === 1) state.relayOn  = val === 1;
        if (type === 2) state.valveOpen = val === 1;

        console.log(`\n⚡ COMMAND: ${typeStr} → ${val ? 'ON' : 'OFF'}`);
        client.publish(
            `device/${DEVICE_ID}/command_ack`,
            JSON.stringify({ status: 'ok', type: typeStr, value: val }),
        );
    }
});

client.on('error', (err) => console.error('MQTT Error:', err.message));
