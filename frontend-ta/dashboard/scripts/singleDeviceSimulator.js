#!/usr/bin/env node
/**
 * Single Device Simulator
 * Dev/QA tool: simulates one meter publishing 25-byte binary telemetry frames.
 * Supports interactive anomaly injection (overvoltage, overcurrent, leakage,
 * tamper, trip) and listens for relay/valve commands from the backend.
 *
 * Specs covered: 5 (relay actuation), 6 (valve actuation), 8 (anomaly triggers)
 *
 * Usage: node singleDeviceSimulator.js [UNIT_NO_OR_DEVICE_ID] [BROKER_URL]
 * Example: MQTT_PASSWORD='TA!2025Ok' node singleDeviceSimulator.js DEV-A-101 mqtts://ta252601002.srusun.id:8883
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

const rawDeviceArg = process.argv[2] || 'A-101';
const DEVICE_ID = rawDeviceArg.startsWith('DEV-') ? rawDeviceArg : `DEV-${rawDeviceArg}`;
const UNIT_NO = DEVICE_ID.replace(/^DEV-/, '');
// Use .env broker, then command line arg, then fallback
const BROKER_URL = process.env.MQTT_BROKER_URL || process.argv[3] || 'mqtt://ta252601002.srusun.id:1883';
// Device simulators must always authenticate as the device being simulated,
// never as the backend service (MQTT_USERNAME/MQTT_PASSWORD are for the backend).
const MQTT_USERNAME = DEVICE_ID;
const MQTT_PASSWORD = process.env.MQTT_DEVICE_SECRET || undefined;
const MQTT_TLS_VERIFY = process.env.MQTT_TLS_VERIFY === 'true';
const INTERVAL_MS = 2000;
const NORMAL_POWER_MIN_W = Number(process.env.NORMAL_POWER_MIN_W || 450);
const NORMAL_POWER_MAX_W = Number(process.env.NORMAL_POWER_MAX_W || 950);
const NORMAL_FLOW_MIN_LPM = Number(process.env.NORMAL_FLOW_MIN_LPM || 2);
const NORMAL_FLOW_MAX_LPM = Number(process.env.NORMAL_FLOW_MAX_LPM || 6);

console.log('====================================================');
console.log(`🔌 Single Device Simulator`);
console.log(`   Unit: ${UNIT_NO} | Device: ${DEVICE_ID}`);
console.log(`   Broker: ${BROKER_URL}`);
console.log(`   MQTT username: ${MQTT_USERNAME}`);
console.log(`   TLS verify: ${MQTT_TLS_VERIFY ? 'on' : 'off'}`);
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
    lastTopupTs: 0,
    relayOn: true,
    valveOpen: true,
    anomaly: null,
};

const STATUS_TOPIC = `device/${DEVICE_ID}/status`;

const client = mqtt.connect(BROKER_URL, {
    clientId: `single-sim-${DEVICE_ID}-${Date.now().toString(36)}`,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clean: true,
    // Keep this false for debugging while EMQX still serves a self-signed cert.
    // Set MQTT_TLS_VERIFY=true after EMQX serves a valid ta252601002.srusun.id cert.
    rejectUnauthorized: MQTT_TLS_VERIFY,
    will: {
        topic:   STATUS_TOPIC,
        payload: 'offline',
        qos:     1,
        retain:  true,
    },
});

const generatePayload = () => {
    // Normal mode must stay below the backend MCB limit (1300 W).
    // At 1000 W × 2 s → 0.00056 kWh delta; encoding precision is 0.01 kWh, so ~18 frames
    // Use the interactive "overcurrent" command when an anomaly frame is desired.
    let power = NORMAL_POWER_MIN_W + Math.random() * (NORMAL_POWER_MAX_W - NORMAL_POWER_MIN_W);
    let voltage = Math.random() * 5 + 218;   // 218–223 V
    let flowRate = NORMAL_FLOW_MIN_LPM + Math.random() * (NORMAL_FLOW_MAX_LPM - NORMAL_FLOW_MIN_LPM);

    if (state.anomaly) {
        switch (state.anomaly) {
            case 'overvoltage':  voltage = 260.5; break;
            case 'undervoltage': voltage = 160.0; break;
            case 'overcurrent':  power = 3000; break;
            case 'leakage':      flowRate = 50.0; break;
            case 'trip':         state.relayOn = false; power = 10; break;
        }
    }

    if (state.elecTokenKwh <= 0) {
        state.elecTokenKwh = 0;
        state.relayOn = false;
    }
    if (state.waterTokenM3 <= 0) {
        state.waterTokenM3 = 0;
        state.valveOpen = false;
    }
    if (!state.relayOn && state.anomaly !== 'trip') power = 0;
    if (!state.valveOpen) flowRate = 0;

    // Accumulate totals using correct time-based formulas:
    //   energy (kWh) = power (W) × time (s) / 3_600_000
    //   water  (m³)  = flow (L/min) × time (s) / 60_000
    const intervalSec = INTERVAL_MS / 1000;
    const energyDeltaKwh = power * intervalSec / 3_600_000;
    const waterDeltaM3 = flowRate * intervalSec / 60_000;
    state.energyTotal += energyDeltaKwh;
    state.waterTotal += waterDeltaM3;
    state.elecTokenKwh = Math.max(0, state.elecTokenKwh - energyDeltaKwh);
    state.waterTokenM3 = Math.max(0, state.waterTokenM3 - waterDeltaM3);
    if (state.elecTokenKwh <= 0) state.relayOn = false;
    if (state.waterTokenM3 <= 0) state.valveOpen = false;

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

    client.publish(STATUS_TOPIC, JSON.stringify({ online: true }), { retain: true, qos: 1 });

    client.subscribe(`device/${DEVICE_ID}/command`);
    client.subscribe(`device/${DEVICE_ID}/config`);
    client.subscribe(`device/${DEVICE_ID}/ota`);
    client.subscribe(`device/${DEVICE_ID}/topup`);

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
            if (state.elecTokenKwh > 0) state.relayOn = true;
            if (state.waterTokenM3 > 0) state.valveOpen = true;
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
    // ── Relay / valve command (1 byte binary) ─────────────────────────────
    if (topic === `device/${DEVICE_ID}/command` && message.length === 1) {
        const type   = (message[0] >> 4) & 0x0F;
        const val    = message[0] & 0x0F;
        const typeStr = type === 1 ? 'relay' : type === 2 ? 'valve' : 'unknown';

        if (type === 1) state.relayOn = val === 1 && state.elecTokenKwh > 0;
        if (type === 2) state.valveOpen = val === 1 && state.waterTokenM3 > 0;

        console.log(`\n⚡ COMMAND: ${typeStr} → ${val ? 'ON' : 'OFF'}`);
        client.publish(
            `device/${DEVICE_ID}/command_ack`,
            JSON.stringify({ status: 'ok', type: typeStr, value: val }),
        );
        return;
    }

    // ── Calibration config (4 bytes binary) ───────────────────────────────
    // bytes [0:1] uint16 BE = CAL_FACTOR_FLOWRATE × 100
    // byte  [2]   uint8    = CAL_FACTOR_POWER    × 100
    // byte  [3]   uint8    = SENSOR_SAMPLING_TIME
    if (topic === `device/${DEVICE_ID}/config` && message.length === 4) {
        const cf = message.readUInt16BE(0) / 100;
        const cp = message[2] / 100;
        const st = message[3];
        console.log(`\n🔧 CONFIG: flowrate=${cf} power=${cp} sampling=${st}s`);
        client.publish(
            `device/${DEVICE_ID}/config_ack`,
            JSON.stringify({ status: 'ok', cf, cp, st }),
        );
        return;
    }

    // ── OTA firmware update (4+ bytes binary) ─────────────────────────────
    // byte[0] major, byte[1] minor, byte[2] patch, byte[3] flags, byte[4..] URL
    if (topic === `device/${DEVICE_ID}/ota` && message.length >= 4) {
        const major = message[0], minor = message[1], patch = message[2];
        const version = `${major}.${minor}.${patch}`;
        const url = message.slice(4).toString('utf8');
        console.log(`\n📦 OTA: v${version}  url=${url}`);
        // Simulate a 2s flash delay then ack success
        setTimeout(() => {
            client.publish(
                `device/${DEVICE_ID}/ota_ack`,
                JSON.stringify({ status: 'ok', version }),
            );
            console.log(`\n✅ OTA flash complete v${version}`);
        }, 2000);
        return;
    }

    // ── Token top-up (12 bytes binary) ────────────────────────────────────
    // bytes [0:3] uint32 BE = electricity token (kWh x 1000)
    // bytes [4:7] uint32 BE = water token (m3 x 1000)
    // bytes [8:11] uint32 BE = timestamp (unix seconds)
    if (topic === `device/${DEVICE_ID}/topup` && message.length === 12) {
        const electricTokenKwh = message.readUInt32BE(0) / 1000;
        const waterTokenM3 = message.readUInt32BE(4) / 1000;
        const ts = message.readUInt32BE(8);
        const duplicate = state.lastTopupTs !== 0 && ts <= state.lastTopupTs;
        console.log(`\nTOPUP: electricity=${electricTokenKwh.toFixed(3)}kWh water=${waterTokenM3.toFixed(3)}m3`);
        if (!duplicate) {
            state.elecTokenKwh += electricTokenKwh;
            state.waterTokenM3 += waterTokenM3;
            state.lastTopupTs = ts;
        }
        if (state.elecTokenKwh > 0) state.relayOn = true;
        if (state.waterTokenM3 > 0) state.valveOpen = true;
        client.publish(
            `device/${DEVICE_ID}/topup_ack`,
            JSON.stringify({
                status: 'ok',
                electricTokenKwh,
                waterTokenM3,
                duplicate,
                te: Number(state.elecTokenKwh.toFixed(4)),
                tw: Number(state.waterTokenM3.toFixed(4)),
            }),
        );
        return;
    }
});

client.on('error', (err) => console.error('MQTT Error:', err.message));

process.on('SIGINT', () => {
    console.log('\n[Shutdown] Publishing offline status...');
    client.publish(STATUS_TOPIC, 'offline', { retain: true, qos: 1 }, () => {
        client.end();
        process.exit(0);
    });
});
