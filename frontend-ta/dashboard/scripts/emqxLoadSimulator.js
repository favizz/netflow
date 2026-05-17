const mqtt = require('mqtt');
const readline = require('readline');
const { encode } = require('@msgpack/msgpack');

// --- CONFIGURATION ---
const BROKER_URL = 'mqtt://broker.emqx.io:1883'; // URL EMQX
const TOTAL_UNITS = 2444;                        // Jumlah unit yang akan disimulasikan
const BATCH_SIZE = 50;                           // Hubungkan 50 device per batch untuk menghindari limit rate
const BATCH_DELAY_MS = 1000;                     // Jeda antar batch 1 detik
const PUBLISH_INTERVAL_MS = 15000;               // Kirim telemetri setiap 15 detik untuk semua device

// State untuk menyimpan koneksi client dan anomali aktif
const clients = new Map();
const activeAnomalies = new Map();

console.log(`====================================================`);
console.log(`🚀 EMQX Load & Anomaly Simulator (v2 Binary Protocol)`);
console.log(`====================================================`);
console.log(`Broker   : ${BROKER_URL}`);
console.log(`Target   : ${TOTAL_UNITS} Units`);
console.log(`Interval : ${PUBLISH_INTERVAL_MS / 1000} seconds`);
console.log(`----------------------------------------------------\n`);

// Helper function untuk memformat nama unit (misal 1 -> A-0001)
const getUnitName = (index) => `A-${String(index).padStart(4, '0')}`;
const getDeviceId = (index) => `SMART-METER-${String(index).padStart(4, '0')}`;

// Helper: Generate data telemetri normal atau anomali
const generatePayload = (unitId, deviceId, state) => {
    let power = Math.random() * 100 + 50; // 50 - 150 W (typical apartment)
    let voltage = Math.random() * 5 + 220; // 220 - 225 V
    let flowRate = Math.random() * 1.5 + 0.5; // 0.5 - 2 LPM (typical residential)
    
    // Anomali aktif
    const anomaly = activeAnomalies.get(unitId);
    let balance = undefined;

    if (anomaly) {
        switch (anomaly) {
            case 'overvoltage':
                voltage = 260.5; // Contoh Overvoltage
                break;
            case 'undervoltage':
                voltage = 160.0;
                break;
            case 'overcurrent':
                power = 3000;
                break;
            case 'leakage':
                flowRate = 50.0;
                break;
            case 'trip':
                state.relayOn = false;
                break;
            case 'lowtoken':
                balance = 100; // Rp 100
                break;
        }
    }

    // Jika relay mati, power = 0
    if (!state.relayOn) power = 0;
    // Jika valve tertutup, flow = 0
    if (!state.valveOpen) flowRate = 0;

    state.energyTotal += (power / 3600); // KWh
    state.waterTotal += (flowRate / 60); // M3

    const payload = {
        et: parseFloat(state.energyTotal.toFixed(4)),
        p: parseFloat(power.toFixed(2)),
        v: parseFloat(voltage.toFixed(2)),
        c: parseFloat((power / voltage).toFixed(2)),
        rs: state.relayOn ? 1 : 0,
        wt: parseFloat(state.waterTotal.toFixed(4)),
        wf: parseFloat(flowRate.toFixed(2)),
        vs: state.valveOpen ? 1 : 0
    };

    if (balance !== undefined) {
        payload.b = balance;
    }

    return payload;
};

// Proses menghubungkan device secara bertahap (batching)
let connectedCount = 0;
const connectBatch = async (startIndex) => {
    const endIndex = Math.min(startIndex + BATCH_SIZE, TOTAL_UNITS + 1);
    
    for (let i = startIndex; i < endIndex; i++) {
        const unitId = getUnitName(i);
        const deviceId = getDeviceId(i);
        
        const client = mqtt.connect(BROKER_URL, {
            clientId: `sim-${deviceId}-${Math.random().toString(16).substr(2, 6)}`,
            clean: true,
            connectTimeout: 4000,
            reconnectPeriod: 1000,
        });

        // State simulasi per device
        const deviceState = {
            energyTotal: 0, // Mulai dari 0 agar sinkron dengan database
            waterTotal: 0,
            relayOn: true,
            valveOpen: true
        };

        client.on('connect', () => {
            connectedCount++;
            clients.set(unitId, { client, deviceId, state: deviceState });
            
            // Subscribe ke command topic sesuai v2 protocol
            client.subscribe(`device/${deviceId}/command`);
            client.subscribe(`device/${deviceId}/ota`);
            client.subscribe(`device/${deviceId}/config`);
            
            if (connectedCount % 100 === 0 || connectedCount === TOTAL_UNITS) {
                console.log(`[INFO] Connected ${connectedCount}/${TOTAL_UNITS} devices...`);
            }
        });

        client.on('message', (topic, message) => {
            if (topic === `device/${deviceId}/command`) {
                if (message.length === 1) {
                    const byte = message[0];
                    const type = (byte >> 4) & 0x0F; // 1=relay, 2=valve
                    const val = byte & 0x0F;        // 0=off, 1=on
                    
                    let typeStr = 'unknown';
                    if (type === 1) {
                        deviceState.relayOn = val === 1;
                        typeStr = 'relay';
                    } else if (type === 2) {
                        deviceState.valveOpen = val === 1;
                        typeStr = 'valve';
                    }
        
                    console.log(`\n🚨 [COMMAND IN] ${deviceId} ${typeStr} -> ${val ? 'ON' : 'OFF'}`);
                    
                    // SEND ACK
                    const ackTopic = `device/${deviceId}/command_ack`;
                    const ackPayload = JSON.stringify({ status: 'ok', type: typeStr, value: val });
                    client.publish(ackTopic, ackPayload);
                }
            }
        });

        client.on('error', (err) => {
            // Abaikan log error jika terlalu banyak
        });
    }

    if (endIndex <= TOTAL_UNITS) {
        setTimeout(() => connectBatch(endIndex), BATCH_DELAY_MS);
    } else {
        console.log(`\n✅ Selesai menginisialisasi ${TOTAL_UNITS} koneksi.`);
        startTelemetryLoop();
        startInteractiveCLI();
    }
};

// Loop untuk mengirim data telemetri
const startTelemetryLoop = () => {
    setInterval(() => {
        let sentCount = 0;
        clients.forEach(({ client, deviceId, state }, unitId) => {
            if (client.connected) {
                const topic = `device/${deviceId}/data`;
                const payloadObj = generatePayload(unitId, deviceId, state);
                const msgpackPayload = Buffer.from(encode(payloadObj));
                
                client.publish(topic, msgpackPayload, { qos: 0 });
                sentCount++;
            }
        });
        process.stdout.write(`\r[PUBLISH] Mem-publish telemetri ke ${sentCount} perangkat aktif (Binary Protocol)... `);
    }, PUBLISH_INTERVAL_MS);
};

// CLI Interaktif untuk men-trigger anomali
const startInteractiveCLI = () => {
    console.log(`\n----------------------------------------------------`);
    console.log(`🎮 Interactive Anomaly Trigger Aktif!`);
    console.log(`Ketik perintah berikut untuk memicu anomali:`);
    console.log(`- overvoltage <unit>   (Contoh: overvoltage A-0005)`);
    console.log(`- undervoltage <unit>`);
    console.log(`- overcurrent <unit>`);
    console.log(`- lowtoken <unit>`);
    console.log(`- leakage <unit>`);
    console.log(`- trip <unit>`);
    console.log(`- normal <unit>        (Untuk mengembalikan unit ke kondisi normal)`);
    console.log(`----------------------------------------------------\n`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', (input) => {
        const [command, targetUnit] = input.trim().split(' ');
        
        if (!targetUnit) {
            console.log(`❌ Error: Format salah. Harus: <anomali> <unit_id>`);
            return;
        }

        const unitUpper = targetUnit.toUpperCase();

        if (command === 'normal') {
            activeAnomalies.delete(unitUpper);
            console.log(`✅ [NORMAL] Unit ${unitUpper} dikembalikan ke kondisi normal.`);
        } else if (['overvoltage', 'undervoltage', 'overcurrent', 'lowtoken', 'leakage', 'trip'].includes(command)) {
            activeAnomalies.set(unitUpper, command);
            console.log(`🚨 [ANOMALI] Men-trigger '${command}' pada unit ${unitUpper}.`);
            
            // Langsung kirim 1 data segera
            const c = clients.get(unitUpper);
            if(c && c.client.connected) {
                const topic = `device/${c.deviceId}/data`;
                const payloadObj = generatePayload(unitUpper, c.deviceId, c.state);
                const msgpackPayload = Buffer.from(encode(payloadObj));
                c.client.publish(topic, msgpackPayload);
            }
        } else {
            console.log(`❌ Error: Perintah '${command}' tidak dikenali.`);
        }
    });
};

// Mulai menghubungkan perangkat (Mulai dari indeks 1)
connectBatch(1);
