const mqtt = require('mqtt');
const readline = require('readline');

// ── USAGE: node scripts/singleDeviceSimulator.js [UNIT_NO]
// Example: node scripts/singleDeviceSimulator.js A-0002
const UNIT_NO = process.argv[2] || 'A-0002';
const DEVICE_ID = `DEV-${UNIT_NO}`;
const BROKER_URL = 'mqtt://broker.emqx.io:1883';
const INTERVAL_MS = 5000;

console.log('====================================================');
console.log(`🔌 Single Device Simulator`);
console.log(`   Unit: ${UNIT_NO} | Device: ${DEVICE_ID}`);
console.log(`   Broker: ${BROKER_URL}`);
console.log(`   Interval: ${INTERVAL_MS / 1000}s`);
console.log('====================================================\n');

// 21-byte binary protocol matching binary-codec.ts
//   [0:3]  uint32 BE  et × 100     energy_total (kWh)
//   [4:5]  uint16 BE  p  × 10      power (W)
//   [6:7]  uint16 BE  v  × 10      voltage (V)
//   [8:9]  uint16 BE  c  × 1000    current (A)
//   [10:11] uint16 BE wf × 100     water_flow (L/min)
//   [12:15] uint32 BE wt × 1000    water_total (m³)
//   [16:19] uint32 BE b            balance (Rp)
//   [20]    uint8     flags        bit0=relay, bit1=valve
function encodeTelemetry(t) {
    const buf = Buffer.allocUnsafe(21);
    buf.writeUInt32BE(Math.round(t.et * 100), 0);
    buf.writeUInt16BE(Math.round(t.p * 10), 4);
    buf.writeUInt16BE(Math.round(t.v * 10), 6);
    buf.writeUInt16BE(Math.round(t.c * 1000), 8);
    buf.writeUInt16BE(Math.round(t.wf * 100), 10);
    buf.writeUInt32BE(Math.round(t.wt * 1000), 12);
    buf.writeUInt32BE(Math.round(t.b), 16);
    buf[20] = (t.rs & 1) | ((t.vs & 1) << 1);
    return buf;
}

const state = {
    energyTotal: 0,   // kWh
    waterTotal: 0,    // m³
    balance: 100000,  // Rp — simulator-side tracking (backend is authoritative)
    relayOn: true,
    valveOpen: true,
    anomaly: null,
};

const client = mqtt.connect(BROKER_URL, {
    clientId: `single-sim-${DEVICE_ID}-${Date.now().toString(36)}`,
    clean: true,
});

const generatePayload = () => {
    let power = Math.random() * 100 + 50;    // 50–150 W
    let voltage = Math.random() * 5 + 220;   // 220–225 V
    let flowRate = Math.random() * 1.5 + 0.5; // 0.5–2 L/min

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
        b:  Math.round(state.balance),
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
            `\r📡 v=${payload.v}V p=${payload.p}W wf=${payload.wf}L/min et=${payload.et}kWh b=Rp${payload.b} | Anomaly: ${state.anomaly || 'none'}   `
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
