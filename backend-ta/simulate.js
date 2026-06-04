const mqtt = require('mqtt');
require('dotenv').config({ path: '../.env' });

const brokerUrl      = process.env.MQTT_BROKER_URL      || 'mqtt://broker.emqx.io:1883';
const mqttSecret     = process.env.MQTT_DEVICE_SECRET   || '';
const deviceId       = process.argv[2] || 'DEV-A-101';
const intervalMs     = 5000;
const statusTopic    = `device/${deviceId}/status`;

console.log(`Connecting to MQTT Broker at ${brokerUrl}...`);
const client = mqtt.connect(brokerUrl, {
    clientId: `sim-${deviceId}`,
    username: deviceId,
    password: mqttSecret,
    will: {
        topic:   statusTopic,
        payload: 'offline',
        qos:     1,
        retain:  true,
    },
});

let energyTotal = 1250;
let waterTotal = 180;
let electricTokenKwh = 50;
let waterTokenM3 = 10;

// Device Physical States
let relayOn = true;
let valveOpen = true;

// Calibration factors (simulated)
let cf = 4.55;
let cp = 1.05;
let st = 5;

client.on('connect', () => {
    console.log(`[Success] Connected to EMQX. Simulating telemetry for ${deviceId}`);
    console.log(`(Press Ctrl+C to stop the simulation)`);

    // Announce online presence (retained so dashboard sees it)
    client.publish(statusTopic, JSON.stringify({ online: true }), { retain: true, qos: 1 });

    // Subscribe to all control channels
    const topics = [
        `device/${deviceId}/command`,
        `device/${deviceId}/ota`,
        `device/${deviceId}/config`
    ];
    client.subscribe(topics, { qos: 1 });
    console.log(`[Listening] Subscribed to: ${topics.join(', ')}`);

    setInterval(() => {
        // Drop power and flow to 0 when disconnected
        const power = relayOn ? (650 + (Math.random() * 100 - 50)) : 0;
        const flow = valveOpen ? (2.5 + (Math.random() * 1.0 - 0.5)) : 0;
        
        energyTotal += (power / 3600); 
        waterTotal += (flow / 60);

        const payload = {
            et: parseFloat(energyTotal.toFixed(4)),
            p: parseFloat(power.toFixed(2)),
            v: relayOn ? (220 + (Math.random() * 2)) : 0,
            c: relayOn ? parseFloat((power / 220).toFixed(2)) : 0,
            rs: relayOn ? 1 : 0,
            wt: parseFloat(waterTotal.toFixed(4)),
            wf: parseFloat(flow.toFixed(2)),
            vs: valveOpen ? 1 : 0,
            te: electricTokenKwh,
            tw: waterTokenM3,
        };

        const topic = `device/${deviceId}/data`;
        client.publish(topic, encodeTelemetry(payload));
        // console.log(`[Telemetry] -> ${topic} | Power: ${power.toFixed(1)}W | Flow: ${flow.toFixed(2)}L/min`);
    }, intervalMs);
});

client.on('message', (topic, message) => {
    console.log(`\n[Incoming] Topic: ${topic} | Length: ${message.length} bytes`);

    // ── 1. Binary Commands (Relay/Valve) ────────────────────────────────────
    if (topic === `device/${deviceId}/command`) {
        if (message.length === 1) {
            const byte = message[0];
            const type = (byte >> 4) & 0x0F; // 1=relay, 2=valve
            const val = byte & 0x0F;        // 0=off, 1=on
            
            let typeStr = 'unknown';
            if (type === 1) {
                relayOn = val === 1;
                typeStr = 'relay';
            } else if (type === 2) {
                valveOpen = val === 1;
                typeStr = 'valve';
            }

            console.log(`🚨 [COMMAND] ${typeStr} -> ${val ? 'ON/OPEN' : 'OFF/CLOSE'}`);
            
            // SEND ACK
            const ackTopic = `device/${deviceId}/command_ack`;
            const ackPayload = JSON.stringify({ status: 'ok', type: typeStr, value: val });
            client.publish(ackTopic, ackPayload);
            console.log(`   [ACK] -> ${ackTopic}`);
        }
    }

    // ── 2. Binary Calibration (Config) ──────────────────────────────────────
    if (topic === `device/${deviceId}/config`) {
        if (message.length === 4) {
            const cf_raw = message.readUInt16BE(0);
            cf = cf_raw / 100;
            cp = message[2] / 100;
            st = message[3];

            console.log(`⚙️  [CONFIG] CF: ${cf.toFixed(2)}, CP: ${cp.toFixed(2)}, ST: ${st}s`);

            // SEND ACK
            const ackTopic = `device/${deviceId}/config_ack`;
            const ackPayload = JSON.stringify({ status: 'ok' });
            client.publish(ackTopic, ackPayload);
            console.log(`   [ACK] -> ${ackTopic}`);
        }
    }

    // ── 3. Binary OTA Update ────────────────────────────────────────────────
    if (topic === `device/${deviceId}/ota`) {
        if (message.length >= 4) {
            const major = message[0];
            const minor = message[1];
            const patch = message[2];
            const flags = message[3];
            const url = message.slice(4).toString('utf8');

            console.log(`🚀 [OTA] Version: ${major}.${minor}.${patch} | Flags: 0x${flags.toString(16)}`);
            console.log(`   URL: ${url}`);

            // Simulate update delay
            console.log(`   Flashing...`);
            setTimeout(() => {
                const ackTopic = `device/${deviceId}/ota_ack`;
                const ackPayload = JSON.stringify({ status: 'ok', version: `${major}.${minor}.${patch}` });
                client.publish(ackTopic, ackPayload);
                console.log(`   [ACK] -> ${ackTopic} | Device Reboots.`);
            }, 2000);
        }
    }
});

client.on('error', (err) => {
    console.error('MQTT Connection Error:', err.message);
});

process.on('SIGINT', () => {
    console.log('\n[Shutdown] Publishing offline status...');
    client.publish(statusTopic, 'offline', { retain: true, qos: 1 }, () => {
        client.end();
        process.exit(0);
    });
});

function encodeTelemetry(t) {
    const buf = Buffer.allocUnsafe(25);
    buf.writeUInt32BE(Math.round(t.et * 100), 0);
    buf.writeUInt16BE(Math.round(t.p * 10), 4);
    buf.writeUInt16BE(Math.round(t.v * 10), 6);
    buf.writeUInt16BE(Math.round(t.c * 1000), 8);
    buf.writeUInt16BE(Math.round(t.wf * 100), 10);
    buf.writeUInt32BE(Math.round(t.wt * 1000), 12);
    buf.writeUInt32BE(Math.round(t.te * 1000), 16);
    buf.writeUInt32BE(Math.round(t.tw * 1000), 20);
    buf[24] = (t.rs & 1) | ((t.vs & 1) << 1);
    return buf;
}
