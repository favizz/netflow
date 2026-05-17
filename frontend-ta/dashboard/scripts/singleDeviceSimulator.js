const mqtt = require('mqtt');
const readline = require('readline');
const { encode } = require('@msgpack/msgpack');

// ── USAGE: node scripts/singleDeviceSimulator.js [UNIT_NO]
// Example: node scripts/singleDeviceSimulator.js A-0002
const UNIT_NO = process.argv[2] || 'A-0002';
const DEVICE_ID = `SMART-METER-${UNIT_NO.split('-')[1]}`;
const BROKER_URL = 'mqtt://broker.emqx.io:1883';
const INTERVAL_MS = 5000; // Send every 5 seconds for faster testing

console.log('====================================================');
console.log(`🔌 Single Device Simulator`);
console.log(`   Unit: ${UNIT_NO} | Device: ${DEVICE_ID}`);
console.log(`   Broker: ${BROKER_URL}`);
console.log(`   Interval: ${INTERVAL_MS / 1000}s`);
console.log('====================================================\n');

const state = {
    energyTotal: 0,
    waterTotal: 0,
    relayOn: true,
    valveOpen: true,
    anomaly: null,
};

const client = mqtt.connect(BROKER_URL, {
    clientId: `single-sim-${DEVICE_ID}-${Date.now().toString(36)}`,
    clean: true,
});

const generatePayload = () => {
    let power = Math.random() * 100 + 50;   // 50-150W
    let voltage = Math.random() * 5 + 220;  // 220-225V
    let flowRate = Math.random() * 1.5 + 0.5; // 0.5-2 LPM

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

    state.energyTotal += power / 3600;
    state.waterTotal += flowRate / 60;

    return {
        et: parseFloat(state.energyTotal.toFixed(4)),
        p: parseFloat(power.toFixed(2)),
        v: parseFloat(voltage.toFixed(2)),
        c: parseFloat((power / voltage).toFixed(2)),
        rs: state.relayOn ? 1 : 0,
        wt: parseFloat(state.waterTotal.toFixed(4)),
        wf: parseFloat(flowRate.toFixed(2)),
        vs: state.valveOpen ? 1 : 0,
    };
};

client.on('connect', () => {
    console.log(`✅ Connected as ${DEVICE_ID}\n`);

    // Subscribe to commands
    client.subscribe(`device/${DEVICE_ID}/command`);

    // Start telemetry loop
    setInterval(() => {
        const payload = generatePayload();
        const msgpack = Buffer.from(encode(payload));
        client.publish(`device/${DEVICE_ID}/data`, msgpack, { qos: 0 });
        process.stdout.write(`\r📡 v=${payload.v}V p=${payload.p}W wf=${payload.wf}LPM et=${payload.et}kWh | Anomaly: ${state.anomaly || 'none'}   `);
    }, INTERVAL_MS);

    // Interactive CLI
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
            // Send immediately
            const payload = generatePayload();
            client.publish(`device/${DEVICE_ID}/data`, Buffer.from(encode(payload)));
        } else {
            console.log(`\n❌ Unknown: ${cmd}`);
        }
    });
});

client.on('message', (topic, message) => {
    if (topic === `device/${DEVICE_ID}/command` && message.length === 1) {
        const type = (message[0] >> 4) & 0x0F;
        const val = message[0] & 0x0F;
        const typeStr = type === 1 ? 'relay' : type === 2 ? 'valve' : 'unknown';

        if (type === 1) state.relayOn = val === 1;
        if (type === 2) state.valveOpen = val === 1;

        console.log(`\n⚡ COMMAND: ${typeStr} → ${val ? 'ON' : 'OFF'}`);
        client.publish(`device/${DEVICE_ID}/command_ack`, JSON.stringify({ status: 'ok', type: typeStr, value: val }));
    }
});

client.on('error', (err) => console.error('MQTT Error:', err.message));
