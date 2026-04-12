const mqtt = require('mqtt');
const { encode } = require('@msgpack/msgpack');
require('dotenv').config({ path: '../.env' });

const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.emqx.io:1883';
const deviceId = process.argv[2] || 'DEV-A-101';
const intervalMs = 5000;

console.log(`Connecting to MQTT Broker at ${brokerUrl}...`);
const client = mqtt.connect(brokerUrl);

let energyTotal = 1250;
let waterTotal = 180;

// Device Physical States
let relayOn = true;
let valveOpen = true;

client.on('connect', () => {
    console.log(`[Success] Connected to EMQX. Simulating telemetry for ${deviceId}`);
    console.log(`(Press Ctrl+C to stop the simulation)`);

    // Subscribe to physical command channels
    client.subscribe(`device/${deviceId}/relay/set`, { qos: 1 });
    client.subscribe(`device/${deviceId}/valve/set`, { qos: 1 });
    console.log(`[Listening] Emulating hardware triggers for relay & valve.`);

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
            vs: valveOpen ? 1 : 0
        };

        const topic = `device/${deviceId}/data`;
        // Encode as MessagePack binary (~40-50 bytes vs ~90 bytes JSON)
        const msgpackPayload = Buffer.from(encode(payload));
        client.publish(topic, msgpackPayload);
        console.log(`[Telemetry] -> ${topic} | Power: ${power.toFixed(1)}W | Flow: ${flow.toFixed(2)}L/min`);
    }, intervalMs);
});

client.on('message', (topic, message) => {
    try {
        const rawPayload = message.toString().trim();
        let actionTriggered = false;

        // Strip NestJS envelope fallback conceptually, but we expect raw strings "1" or "0"
        let cmd = rawPayload;
        
        // Safety try-catch if it's sent as JSON by accident
        try {
            const temp = JSON.parse(rawPayload);
            if (temp.data?.relay) cmd = temp.data.relay === 'ON' ? '1' : '0';
            if (temp.data?.valve) cmd = temp.data.valve === 'OPEN' ? '1' : '0';
            if (temp.commands?.relay_command) cmd = temp.commands.relay_command === 'ON' ? '1' : '0';
        } catch(e) {}

        if (topic === `device/${deviceId}/relay/set`) {
            if (cmd === '1') {
                relayOn = true;
                actionTriggered = true;
            } else if (cmd === '0') {
                relayOn = false;
                actionTriggered = true;
            }
        }

        if (topic === `device/${deviceId}/valve/set`) {
            if (cmd === '1') {
                valveOpen = true;
                actionTriggered = true;
            } else if (cmd === '0') {
                valveOpen = false;
                actionTriggered = true;
            }
        }

        if (actionTriggered) {
             console.log(`\n🚨 [COMMAND INGESTED] Hardware Switch Toggled! Relay: ${relayOn ? 'ON' : 'OFF'} | Valve: ${valveOpen ? 'OPEN' : 'CLOSE'}\n`);
        }
    } catch (e) {
        console.error("Failed to parse command payload:", e.message);
    }
});

client.on('error', (err) => {
    console.error('MQTT Connection Error:', err.message);
});
