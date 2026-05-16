const mqtt = require('mqtt');
const { encode } = require('@msgpack/msgpack');

const BROKER_URL = 'mqtt://broker.emqx.io:1883';
const TOTAL_UNITS = 2444;
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000;
const PUBLISH_INTERVAL_MS = 15000;

const clients = new Map();
const activeAnomalies = new Map();

console.log(`====================================================`);
console.log(`🚀 AUTO TEST: Anomaly Simulator (2444 Units)`);
console.log(`====================================================`);

const getUnitName = (index) => `A-${String(index).padStart(4, '0')}`;
const getDeviceId = (index) => `SMART-METER-${String(index).padStart(4, '0')}`;

const generatePayload = (unitId, deviceId, state) => {
    let power = Math.random() * 500 + 200;
    let voltage = Math.random() * 5 + 220;
    let flowRate = Math.random() * 10 + 5;
    
    const anomaly = activeAnomalies.get(unitId);

    if (anomaly) {
        switch (anomaly) {
            case 'overvoltage': voltage = 260.5; break;
            case 'undervoltage': voltage = 160.0; break;
            case 'overcurrent': power = 3000; break;
            case 'leakage': flowRate = 50.0; break;
            case 'trip': state.relayOn = false; power = 10; break; // relay off tapi masih ada power (bypass/trip)
        }
    }

    if (!state.relayOn && anomaly !== 'trip') power = 0;
    if (!state.valveOpen) flowRate = 0;

    state.energyTotal += (power / 3600);
    state.waterTotal += (flowRate / 60);

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

    return payload;
};

let connectedCount = 0;
const connectBatch = async (startIndex) => {
    const endIndex = Math.min(startIndex + BATCH_SIZE, TOTAL_UNITS + 1);
    
    for (let i = startIndex; i < endIndex; i++) {
        const unitId = getUnitName(i);
        const deviceId = getDeviceId(i);
        
        const client = mqtt.connect(BROKER_URL, {
            clientId: `autotest-${deviceId}-${Math.random().toString(16).substr(2, 6)}`,
            clean: true,
            connectTimeout: 4000,
            reconnectPeriod: 1000,
        });

        const deviceState = {
            energyTotal: Math.random() * 1000 + 100,
            waterTotal: Math.random() * 200 + 50,
            relayOn: true,
            valveOpen: true
        };

        client.on('connect', () => {
            connectedCount++;
            clients.set(unitId, { client, deviceId, state: deviceState });
            
            if (connectedCount % 100 === 0 || connectedCount === TOTAL_UNITS) {
                console.log(`[INFO] Connected ${connectedCount}/${TOTAL_UNITS} devices...`);
            }
        });

        client.on('error', () => {});
    }

    if (endIndex <= TOTAL_UNITS) {
        setTimeout(() => connectBatch(endIndex), BATCH_DELAY_MS);
    } else {
        console.log(`\n✅ Selesai menginisialisasi ${TOTAL_UNITS} koneksi.`);
        startTelemetryLoop();
        triggerAutomatedAnomalies();
    }
};

const publishToUnit = (unitId) => {
    const c = clients.get(unitId);
    if(c && c.client.connected) {
        const topic = `device/${c.deviceId}/data`;
        const payloadObj = generatePayload(unitId, c.deviceId, c.state);
        const msgpackPayload = Buffer.from(encode(payloadObj));
        c.client.publish(topic, msgpackPayload, { qos: 0 });
    }
};

const startTelemetryLoop = () => {
    setInterval(() => {
        let sentCount = 0;
        clients.forEach(({ client }, unitId) => {
            if (client.connected) {
                publishToUnit(unitId);
                sentCount++;
            }
        });
        process.stdout.write(`\r[PUBLISH] Mem-publish telemetri ke ${sentCount} perangkat aktif... `);
    }, PUBLISH_INTERVAL_MS);
};

const triggerAutomatedAnomalies = () => {
    console.log(`\n⏳ Menunggu 5 detik sebelum memicu skenario anomali otomatis...`);
    setTimeout(() => {
        console.log(`\n🚨 [AUTO-TRIGGER] Mengirimkan semua skenario anomali secara bersamaan!\n`);
        
        const scenarios = [
            { unit: 'A-0001', type: 'overvoltage', desc: 'Tegangan > 250V' },
            { unit: 'A-0002', type: 'undervoltage', desc: 'Tegangan < 170V' },
            { unit: 'A-0003', type: 'overcurrent', desc: 'Arus MCB Trip > 10A' },
            { unit: 'A-0004', type: 'leakage', desc: 'Kebocoran air > 20 LPM' },
            { unit: 'A-0005', type: 'trip', desc: 'Listrik mengalir saat relay OFF' }
        ];

        scenarios.forEach(sc => {
            activeAnomalies.set(sc.unit, sc.type);
            console.log(`   -> Triggering [${sc.type.toUpperCase()}] pada unit ${sc.unit} (${sc.desc})`);
            publishToUnit(sc.unit);
        });

        console.log(`\n✅ Skenario anomali telah dikirim. Silakan cek Dashboard Anda (Control Center / Notifikasi / Unit Detail).`);
        console.log(`(Catatan: lowtoken tidak disimulasikan di sini karena bergantung pada saldo DB)`);
        
    }, 5000);
};

connectBatch(1);
