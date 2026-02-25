const mqtt = require('mqtt');

// Configuration
const BROKER_URL = 'wss://860d79cbf30e4ed9bd13903e0dbd6db5.s1.eu.hivemq.cloud:8884/mqtt'; // TCP for Node.js
const TOPICS = {
    TELEMETRY: 'jarrdin/A-1204/telemetry',
    POWER_CMD: 'jarrdin/A-1204/power/command',
    WATER_CMD: 'jarrdin/A-1204/water/command'
};

const OPTIONS = {
    clientId: 'simulator-' + Math.random().toString(16).substr(2, 8),
    username: 'alat_iot',
    password: 'Flowmeter123',
};

console.log(`Connecting to MQTT Broker at ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL, OPTIONS);

client.on('connect', () => {
    console.log('✅ Simulator Connected!');
    console.log('🚀 Starting data stream (Press Ctrl+C to stop)...');

    // Unified Data Generation
    const generatePayload = () => {
        const active_power_w = (Math.random() * 500 + 200).toFixed(2);
        const flow_rate_lpm = (Math.random() * 10 + 5).toFixed(2);

        return {
            timestamp: new Date().toISOString(),
            device_id: 'SMART-METER-001',
            electricity: {
                total_energy_kwh: parseFloat((Math.random() * 2000).toFixed(2)),
                active_power_w: parseFloat(active_power_w),
                voltage_v: parseFloat((Math.random() * 5 + 220).toFixed(2)),
                current_a: parseFloat((active_power_w / 220).toFixed(2)),
                frequency_hz: 50.0,
                power_factor: 0.95,
                remaining_token_kwh: parseFloat((Math.random() * 50).toFixed(2)),
                relay_status: "ON"
            },
            water: {
                total_volume_m3: parseFloat((Math.random() * 500).toFixed(2)),
                flow_rate_lpm: parseFloat(flow_rate_lpm),
                remaining_token_m3: parseFloat((Math.random() * 20).toFixed(2)),
                valve_status: "OPEN"
            }
        };
    };

    // Simulate Unified Telemetry (every 5 seconds)
    setInterval(() => {
        const payload = JSON.stringify(generatePayload());
        client.publish(TOPICS.TELEMETRY, payload);
        console.log(`[TELEMETRY] vs. POWER:${JSON.parse(payload).electricity.active_power_w}W, WATER:${JSON.parse(payload).water.flow_rate_lpm}LPM`);
    }, 5000);

    // Subscribe to commands
    client.subscribe([TOPICS.POWER_CMD, TOPICS.WATER_CMD], (err) => {
        if (!err) console.log("✅ Subscribed to command topics");
    });

    client.on('message', (topic, message) => {
        if (topic.includes('command')) {
            console.log(`\n📩 COMMAND RECEIVED on ${topic}:`);
            console.log(JSON.stringify(JSON.parse(message.toString()), null, 2));
            console.log("----------------------------------------\n");
        }
    });
});

client.on('error', (err) => {
    console.error('❌ MQTT Error:', err);
});
