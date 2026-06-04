#!/usr/bin/env node
/**
 * fleet.js — Combined fleet tooling for TA-Flowmeter
 *
 * Subcommands:
 *   seed    One-time DB setup: inserts 2,500 simulated units
 *   sim     Full fleet simulator: 2,500 ESP32 devices at 100% firmware fidelity
 *   verify  Verification suite: 6 tests against a live fleet + DB
 *
 * Usage:
 *   node scripts/fleet.js seed   [--dry-run] [--reset-existing]
 *   node scripts/fleet.js sim    [--count N] [--interval-ms MS] [--no-db-hydrate]
 *   node scripts/fleet.js verify [--test 1,3,5]
 *
 * Environment (from .env three levels up):
 *   MQTT_BROKER_URL          broker URL, e.g. mqtt://localhost:1883
 *   MQTT_DEVICE_SECRET       shared device password
 *   MQTT_USERNAME            backend MQTT username (verify)
 *   MQTT_PASSWORD            backend MQTT password (verify)
 *   MQTT_REJECT_UNAUTHORIZED set to "true" to enforce TLS cert verification
 *   DB_HOST, DB_PORT, DB_USER / DB_USERNAME, DB_PASS / DB_PASSWORD, DB_NAME / DB_DATABASE
 *
 * PM2 (sim):
 *   pm2 start scripts/fleet.js --name fleet-sim -- sim --max-memory-restart 512M
 * Descriptor limit (sim, full fleet):
 *   ulimit -n 65536
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const mqtt  = require('mqtt');
const mysql = require('mysql2/promise');

// ── Fleet layout ───────────────────────────────────────────────────────────────
const BUILDINGS       = ['A', 'B', 'C', 'D', 'E'];
const FLOORS          = 10;
const UNITS_PER_FLOOR = 50;
const TOTAL           = BUILDINGS.length * FLOORS * UNITS_PER_FLOOR; // 2,500

// ── Shared env ────────────────────────────────────────────────────────────────
const BROKER_URL    = process.env.MQTT_BROKER_URL    || 'mqtt://localhost:1883';
const DEVICE_SECRET = process.env.MQTT_DEVICE_SECRET || '';
const MQTT_USER     = process.env.MQTT_USERNAME      || 'netflow-backend';
const MQTT_PASS     = process.env.MQTT_PASSWORD      || '';
const DEVICE_AUTH_MODE = String(process.env.FLEET_DEVICE_AUTH_MODE || 'device').toLowerCase();
const MQTT_REJECT_UNAUTHORIZED =
  String(process.env.MQTT_REJECT_UNAUTHORIZED || 'false').toLowerCase() === 'true';
const LOG_MQTT_ERRORS = String(process.env.FLEET_LOG_MQTT_ERRORS || 'true').toLowerCase() !== 'false';

// ── Shared utilities ───────────────────────────────────────────────────────────
const sleep    = ms => new Promise(r => setTimeout(r, ms));
const pad      = (n, w = 2) => String(n).padStart(w, '0');
const devId    = (b, f, r) => `DEV-${b}-${pad(f)}${pad(r)}`;
const clampU16 = v => Math.min(65535, Math.max(0, Math.round(v)));
const clampU32 = v => Math.min(4294967295, Math.max(0, Math.round(v)));
const drift    = (val, step, lo, hi) =>
  Math.min(hi, Math.max(lo, val + (Math.random() + Math.random() - 1) * step));

function allDeviceIds() {
  const ids = [];
  for (const b of BUILDINGS)
    for (let f = 1; f <= FLOORS; f++)
      for (let r = 1; r <= UNITS_PER_FLOOR; r++)
        ids.push(devId(b, f, r));
  return ids;
}
const randomSample = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);

function dbConfig() {
  return {
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    user:     process.env.DB_USER     || process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASS     || process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || process.env.DB_DATABASE || 'srusun-ta252601002',
    multipleStatements: false,
  };
}

// ── Binary encoding — matches binary-codec.ts encodeTelemetry() (big-endian) ──
function encode(t) {
  const b = Buffer.allocUnsafe(25);
  b.writeUInt32BE(clampU32((t.et ?? 0)  * 100),   0);
  b.writeUInt16BE(clampU16((t.p  ?? 0)  * 10),    4);
  b.writeUInt16BE(clampU16((t.v  ?? 0)  * 10),    6);
  b.writeUInt16BE(clampU16((t.c  ?? 0)  * 1000),  8);
  b.writeUInt16BE(clampU16((t.wf ?? 0)  * 100),  10);
  b.writeUInt32BE(clampU32((t.wt ?? 0)  * 1000), 12);
  b.writeUInt32BE(clampU32((t.te ?? 0)  * 1000), 16);
  b.writeUInt32BE(clampU32((t.tw ?? 0)  * 1000), 20);
  b[24] = (t.rs & 1) | ((t.vs & 1) << 1);
  return b;
}

// Verify-only command encoders
const encodeCommand = (type, value) => Buffer.from([(type << 4) | (value & 0x0F)]);

function encodeConfig(cf = 4.55, cp = 1.05, st = 5) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt16BE(Math.round(cf * 100), 0);
  b[2] = Math.round(cp * 100);
  b[3] = st;
  return b;
}

function encodeOta(major, minor, patch, url, updateNow = true) {
  const urlBuf = Buffer.from(url, 'utf8');
  const buf    = Buffer.allocUnsafe(4 + urlBuf.length);
  buf[0] = major; buf[1] = minor; buf[2] = patch;
  buf[3] = updateNow ? 0x01 : 0x00;
  urlBuf.copy(buf, 4);
  return buf;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED
// ═══════════════════════════════════════════════════════════════════════════════

async function cmdSeed(argv) {
  const DRY_RUN        = argv.includes('--dry-run');
  const RESET_EXISTING = argv.includes('--reset-existing');

  const INIT_ELEC_KWH = 50;
  const INIT_WATER_M3 = 20;

  const makeUnitNo = (b, f, r) => `${b}-${pad(f)}${pad(r)}`;
  const makeDevId  = (b, f, r) => `DEV-${b}-${pad(f)}${pad(r)}`;

  console.log('══════════════════════════════════════════════════════');
  console.log(' Fleet Seeder — TA-Flowmeter');
  console.log(`  Target         : ${TOTAL} units (${BUILDINGS.length} bldg × ${FLOORS} floors × ${UNITS_PER_FLOOR} units)`);
  console.log(`  ID range       : DEV-A-0101 … DEV-E-${pad(FLOORS)}${pad(UNITS_PER_FLOOR)}`);
  console.log(`  Dry run        : ${DRY_RUN}`);
  console.log(`  Reset existing : ${RESET_EXISTING}`);
  console.log('══════════════════════════════════════════════════════\n');

  const db = DRY_RUN ? null : await mysql.createConnection(dbConfig());

  try {
    const bldgIdMap = {};

    for (const code of BUILDINGS) {
      if (DRY_RUN) { bldgIdMap[code] = `(dry-${code})`; continue; }
      await db.execute(
        'INSERT IGNORE INTO buildings (code, name, floors) VALUES (?, ?, ?)',
        [code, `Simulation Tower ${code}`, FLOORS],
      );
      const [[row]] = await db.execute('SELECT id FROM buildings WHERE code = ?', [code]);
      bldgIdMap[code] = row.id;
    }

    const bldgSummary = Object.entries(bldgIdMap).map(([k, v]) => `${k}(id=${v})`).join('  ');
    console.log(`Buildings: ${bldgSummary}\n`);

    let inserted = 0, skipped = 0;

    for (const bldg of BUILDINGS) {
      const bldgId = bldgIdMap[bldg];

      if (DRY_RUN) {
        const first = makeUnitNo(bldg, 1, 1);
        const last  = makeUnitNo(bldg, FLOORS, UNITS_PER_FLOOR);
        console.log(`[DRY] Building ${bldg}: ${FLOORS * UNITS_PER_FLOOR} units  (${first} … ${last})`);
        inserted += FLOORS * UNITS_PER_FLOOR;
        continue;
      }

      for (let floor = 1; floor <= FLOORS; floor++) {
        for (let room = 1; room <= UNITS_PER_FLOOR; room++) {
          const unitNo   = makeUnitNo(bldg, floor, room);
          const deviceId = makeDevId(bldg, floor, room);

          const sql = RESET_EXISTING
            ? `INSERT INTO units
                 (building_id, unit_no, device_id,
                  token_electricity, token_water,
                  relay_status, valve_status,
                  last_energy_reading, last_water_reading)
               VALUES (?, ?, ?, ?, ?, 1, 1, 0, 0)
               ON DUPLICATE KEY UPDATE
                 building_id = VALUES(building_id),
                 device_id = VALUES(device_id),
                 token_electricity = VALUES(token_electricity),
                 token_water = VALUES(token_water),
                 relay_status = VALUES(relay_status),
                 valve_status = VALUES(valve_status),
                 last_energy_reading = VALUES(last_energy_reading),
                 last_water_reading = VALUES(last_water_reading)`
            : `INSERT IGNORE INTO units
                 (building_id, unit_no, device_id,
                  token_electricity, token_water,
                  relay_status, valve_status,
                  last_energy_reading, last_water_reading)
               VALUES (?, ?, ?, ?, ?, 1, 1, 0, 0)`;

          const [res] = await db.execute(sql, [bldgId, unitNo, deviceId, INIT_ELEC_KWH, INIT_WATER_M3]);
          if (res.affectedRows === 1) inserted++; else skipped++;
        }
      }

      process.stdout.write(`\r  [${bldg}] ${inserted} inserted / ${skipped} already existed…   `);
    }

    console.log('\n');
    console.log('══════════════════════════════════════════════════════');
    console.log(' Seeding complete');
    console.log(`  Inserted : ${inserted} new units`);
    console.log(`  Skipped  : ${skipped} already existed`);
    console.log(`  Total    : ${TOTAL} devices in fleet`);
    console.log('');
    console.log('  EMQX will accept all DEV-{A-E}-* device connections automatically.');
    console.log('  No separate EMQX API registration needed (HTTP auth checks this table).');
    console.log('');
    console.log('  Next steps:');
    console.log('    node scripts/fleet.js sim     # start the live fleet');
    console.log('    node scripts/fleet.js verify  # run verification suite');
    console.log('══════════════════════════════════════════════════════');
  } finally {
    if (db) await db.end();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIM
// ═══════════════════════════════════════════════════════════════════════════════

const BATCH_SIZE     = 50;
const BATCH_DELAY_MS = 250;
const REPORT_EVERY_S = 30;
const REPLENISH_S    = 3600;
const RP_PER_KWH     = 1450;
const RP_PER_M3      = 5000;
const DEFAULT_ST     = 5;
const TELEMETRY_QOS   = 1;

function makeDevice(bldg, floor, room, samplingTimeSeconds = DEFAULT_ST) {
  const id = devId(bldg, floor, room);
  return {
    id,
    statusTopic: `device/${id}/status`,
    dataTopic:   `device/${id}/data`,
    v:  219 + Math.random() * 4,
    p:  200 + Math.random() * 800,
    wf: 0.5 + Math.random() * 1.5,
    et: 0, wt: 0,
    te: 50 + Math.random() * 50,
    tw: 20 + Math.random() * 20,
    rs: 1, vs: 1,
    adminLatch: false,
    cf: 4.55, cp: 1.05, st: samplingTimeSeconds,
    version: '1.0.0',
    client: null, connected: false, otaBusy: false,
    offlineBuffer: [],
    lastTopupTs: 0,
    sentTotal: 0, bufferedTotal: 0,
    replenishAt: Date.now() + (Math.random() * REPLENISH_S * 1000),
  };
}

function connectDevice(dev) {
  if (dev.client) {
    try { dev.client.removeAllListeners(); dev.client.end(true); } catch {}
    dev.client = null;
  }

  const useGlobalAuth = DEVICE_AUTH_MODE === 'global';
  const username = useGlobalAuth ? MQTT_USER : dev.id;
  const password = useGlobalAuth ? MQTT_PASS : DEVICE_SECRET;
  let loggedConnectIssue = false;

  const client = mqtt.connect(BROKER_URL, {
    clientId:        `fleet-${dev.id}-${Date.now().toString(36)}`,
    username,
    password,
    clean:           true,
    reconnectPeriod: 8000,
    connectTimeout:  15000,
    rejectUnauthorized: MQTT_REJECT_UNAUTHORIZED,
    will: { topic: dev.statusTopic, payload: 'offline', qos: 1, retain: true },
  });

  client.on('connect', () => {
    dev.connected = true;
    client.publish(dev.statusTopic, JSON.stringify({ online: true }), { retain: true, qos: 1 });
    const base = `device/${dev.id}`;
    client.subscribe([
      `${base}/command`, `${base}/config`, `${base}/ota`,
      `${base}/topup`,   `${base}/admin`,
    ], { qos: 1 });
    if (dev.offlineBuffer.length > 0) {
      const drained = dev.offlineBuffer.splice(0);
      for (const { frame } of drained) publishTelemetry(dev, frame);
    }
  });

  client.on('offline', () => { dev.connected = false; });
  client.on('close',   () => { dev.connected = false; });
  client.on('error',   err => {
    if (!LOG_MQTT_ERRORS || loggedConnectIssue) return;
    loggedConnectIssue = true;
    console.warn(
      `[MQTT ERROR ${dev.id}] ${err.message} ` +
      `(auth=${DEVICE_AUTH_MODE}, username=${username || '<empty>'})`,
    );
  });
  client.on('message', (topic, payload) => onMessage(dev, topic, payload));
  dev.client = client;
}

function onMessage(dev, topic, payload) {
  if (dev.otaBusy) return;
  const base = `device/${dev.id}`;

  if (topic === `${base}/command` && payload.length === 1) {
    const type    = (payload[0] >> 4) & 0x0F;
    const value   = payload[0] & 0x0F;
    const typeStr = type === 1 ? 'relay' : type === 2 ? 'valve' : null;
    if (!typeStr) return;
    if (type === 1) dev.rs = value;
    if (type === 2) dev.vs = value;
    dev.client.publish(`${base}/command_ack`, JSON.stringify({ status: 'ok', type: typeStr, value }));
    return;
  }

  if (topic === `${base}/config` && payload.length === 4) {
    dev.cf = payload.readUInt16BE(0) / 100;
    dev.cp = payload[2] / 100;
    dev.st = payload[3];
    dev.client.publish(`${base}/config_ack`, JSON.stringify({ status: 'ok' }));
    return;
  }

  if (topic === `${base}/ota` && payload.length >= 4) {
    if (!(payload[3] & 0x01)) return;
    runOta(dev, payload[0], payload[1], payload[2], payload.slice(4).toString('utf8'));
    return;
  }

  if (topic === `${base}/topup` && payload.length === 12) {
    const elecRp  = payload.readUInt32BE(0);
    const waterRp = payload.readUInt32BE(4);
    const ts      = payload.readUInt32BE(8);
    if (ts <= dev.lastTopupTs && dev.lastTopupTs !== 0) {
      dev.client.publish(`${base}/topup_ack`,
        JSON.stringify({ status: 'ok', elec: elecRp, water: waterRp, duplicate: true }));
      return;
    }
    dev.te += elecRp  / RP_PER_KWH;
    dev.tw += waterRp / RP_PER_M3;
    if (elecRp  > 0 && dev.rs === 0) dev.rs = 1;
    if (waterRp > 0 && dev.vs === 0) dev.vs = 1;
    dev.lastTopupTs = ts;
    dev.client.publish(`${base}/topup_ack`, JSON.stringify({ status: 'ok', elec: elecRp, water: waterRp }));
    return;
  }

  if (topic === `${base}/admin` && payload.length === 1) {
    const type  = (payload[0] >> 4) & 0x0F;
    const value = payload[0] & 0x0F;
    if (type !== 1) return;
    dev.adminLatch = value !== 0;
    dev.client.publish(`${base}/admin_ack`, JSON.stringify({ status: 'ok', latch: dev.adminLatch }));
    return;
  }
}

async function runOta(dev, major, minor, patch, url) {
  if (dev.otaBusy) return;
  dev.otaBusy = true;
  dev.client.end(false);
  dev.connected = false;

  await sleep(2000 + Math.random() * 3000);

  const newVersion = `${major}.${minor}.${patch}`;
  const useGlobalAuth = DEVICE_AUTH_MODE === 'global';
  const username = useGlobalAuth ? MQTT_USER : dev.id;
  const password = useGlobalAuth ? MQTT_PASS : DEVICE_SECRET;
  const ackClient  = mqtt.connect(BROKER_URL, {
    clientId: `ota-${dev.id}-${Date.now().toString(36)}`,
    username,
    password,
    clean:     true,
    rejectUnauthorized: MQTT_REJECT_UNAUTHORIZED,
    will: { topic: dev.statusTopic, payload: 'offline', qos: 1, retain: true },
  });

  const done = () => {
    ackClient.removeAllListeners();
    ackClient.end(false);
    dev.version = newVersion;
    dev.otaBusy = false;
    connectDevice(dev);
  };

  ackClient.once('connect', () => {
    ackClient.publish(dev.statusTopic, JSON.stringify({ online: true }), { retain: true, qos: 1 });
    ackClient.publish(`device/${dev.id}/ota_ack`, JSON.stringify({ status: 'ok', version: newVersion }));
    setTimeout(done, 500);
  });
  ackClient.once('error', done);
}

let running = true;

function bufferTelemetry(dev, frame) {
  dev.offlineBuffer.push({ topic: dev.dataTopic, frame });
  if (dev.offlineBuffer.length > 100) dev.offlineBuffer.shift();
  dev.bufferedTotal++;
}

function publishTelemetry(dev, frame) {
  if (!dev.connected || !dev.client?.connected) {
    bufferTelemetry(dev, frame);
    return;
  }

  dev.client.publish(dev.dataTopic, frame, { qos: TELEMETRY_QOS }, err => {
    if (err) {
      bufferTelemetry(dev, frame);
      return;
    }
    dev.sentTotal++;
  });
}

function tick(dev) {
  if (dev.otaBusy) return;

  const sec = dev.st;
  dev.v  = drift(dev.v,  0.8,  217.0, 224.0);
  dev.p  = drift(dev.p,  50.0, 100.0, 2500.0);
  dev.wf = drift(dev.wf, 0.15,   0.3,   2.2);

  const effectiveRelay = (dev.te > 0) ? dev.rs : (dev.adminLatch ? 1 : 0);
  const effectiveValve = (dev.tw > 0) ? dev.vs : 0;
  const activePower    = effectiveRelay ? dev.p  : 0;
  const activeFlow     = effectiveValve ? dev.wf : 0;
  const current        = activePower > 0 ? activePower / Math.max(dev.v, 1) : 0;

  dev.et += activePower * sec / 3_600_000;
  dev.wt += activeFlow  * sec / 60_000;
  dev.te -= activePower * sec / 3_600_000;
  dev.tw -= activeFlow  * sec / 60_000;
  if (dev.te < 0) dev.te = 0;
  if (dev.tw < 0) dev.tw = 0;
  if (dev.te <= 0 && dev.rs === 1) dev.rs = 0;
  if (dev.tw <= 0 && dev.vs === 1) dev.vs = 0;

  if (Date.now() >= dev.replenishAt) {
    dev.te += 50;
    dev.tw += 20;
    if (dev.rs === 0 && dev.te > 0) dev.rs = 1;
    if (dev.vs === 0 && dev.tw > 0) dev.vs = 1;
    dev.replenishAt = Date.now() + REPLENISH_S * 1000;
  }

  const frame = encode({
    et: dev.et, p: activePower, v: dev.v, c: current,
    wf: activeFlow, wt: dev.wt,
    te: dev.te, tw: dev.tw,
    rs: effectiveRelay, vs: effectiveValve,
  });

  publishTelemetry(dev, frame);
}

function scheduleTick(dev) {
  if (!running) return;
  const baseMs   = dev.st * 1000;
  const jitterMs = baseMs * 0.1 * (Math.random() * 2 - 1);
  setTimeout(() => { tick(dev); scheduleTick(dev); }, Math.max(1000, baseMs + jitterMs));
}

async function hydrateFromDatabase(allDevices) {
  let db;
  try {
    db = await mysql.createConnection(dbConfig());
    const ids  = allDevices.map(d => d.id);
    const byId = new Map(allDevices.map(d => [d.id, d]));
    let hydrated = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk        = ids.slice(i, i + 500);
      const placeholders = chunk.map(() => '?').join(',');
      const [rows]       = await db.execute(
        `SELECT device_id, token_electricity, token_water,
                relay_status, valve_status,
                last_energy_reading, last_water_reading
           FROM units WHERE device_id IN (${placeholders})`,
        chunk,
      );
      for (const row of rows) {
        const dev = byId.get(row.device_id);
        if (!dev) continue;
        dev.et = Number(row.last_energy_reading || 0);
        dev.wt = Number(row.last_water_reading  || 0);
        dev.te = Number(row.token_electricity   || 0);
        dev.tw = Number(row.token_water         || 0);
        dev.rs = row.relay_status ? 1 : 0;
        dev.vs = row.valve_status ? 1 : 0;
        hydrated++;
      }
    }
    console.log(`  DB hydrate: ${hydrated}/${allDevices.length} device states loaded`);
  } catch (err) {
    console.warn(`  DB hydrate skipped: ${err.message}`);
  } finally {
    if (db) await db.end();
  }
}

async function cmdSim(argv) {
  const countArg    = argv.indexOf('--count');
  const MAX_DEVICES = countArg >= 0 ? parseInt(argv[countArg + 1]) || TOTAL : TOTAL;
  const intervalArg = argv.indexOf('--interval-ms');
  const intervalMs = intervalArg >= 0
    ? Math.max(1000, parseInt(argv[intervalArg + 1]) || DEFAULT_ST * 1000)
    : DEFAULT_ST * 1000;
  const samplingTimeSeconds = intervalMs / 1000;
  const HYDRATE     = !argv.includes('--no-db-hydrate');

  console.log('══════════════════════════════════════════════════════');
  console.log(' NetFlow Fleet Simulator');
  console.log(`  Broker  : ${BROKER_URL}`);
  console.log(`  Fleet   : ${MAX_DEVICES} devices`);
  console.log(`  Interval: ${intervalMs} ms`);
  console.log(`  QoS     : ${TELEMETRY_QOS}`);
  console.log(`  Hydrate : ${HYDRATE ? 'yes (from DB)' : 'no (random baseline)'}`);
  console.log(`  Auth    : ${DEVICE_AUTH_MODE === 'global' ? `global username ${MQTT_USER || '<empty>'}` : 'device_id + MQTT_DEVICE_SECRET'}`);
  console.log('  Note    : requires "ulimit -n 65536" for full fleet');
  console.log('══════════════════════════════════════════════════════\n');

  const devices  = new Map();
  const startTime = Date.now();

  function printStats() {
    const arr      = [...devices.values()];
    const online   = arr.filter(d => d.connected).length;
    const sent     = arr.reduce((s, d) => s + d.sentTotal,     0);
    const buffered = arr.reduce((s, d) => s + d.bufferedTotal, 0);
    const ota      = arr.filter(d => d.otaBusy).length;
    const cutoff   = arr.filter(d => !d.rs || !d.vs).length;
    const uptime   = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `[STATS ${new Date().toISOString()}]` +
      ` online=${online}/${devices.size}` +
      ` sent=${sent} buffered=${buffered}` +
      ` ota=${ota} token_cutoff=${cutoff}` +
      ` uptime=${uptime}s`,
    );
  }

  async function shutdown() {
    if (!running) return;
    running = false;
    console.log('\n[SHUTDOWN] Publishing offline status…');
    const tasks = [...devices.values()].map(dev =>
      new Promise(resolve => {
        if (dev.client?.connected) {
          dev.client.publish(dev.statusTopic, 'offline', { retain: true, qos: 0 }, () => {
            dev.client.end(true); resolve();
          });
        } else { resolve(); }
      }),
    );
    await Promise.allSettled(tasks);
    printStats();
    console.log('[SHUTDOWN] Fleet stopped.');
    process.exit(0);
  }

  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);

  function* generateDevices() {
    let count = 0;
    for (const b of BUILDINGS)
      for (let f = 1; f <= FLOORS; f++)
        for (let r = 1; r <= UNITS_PER_FLOOR; r++) {
          if (count >= MAX_DEVICES) return;
          yield makeDevice(b, f, r, samplingTimeSeconds);
          count++;
        }
  }

  const allDevices = [...generateDevices()];
  if (HYDRATE) await hydrateFromDatabase(allDevices);

  for (let i = 0; i < allDevices.length; i += BATCH_SIZE) {
    const batch = allDevices.slice(i, i + BATCH_SIZE);
    for (const dev of batch) {
      devices.set(dev.id, dev);
      connectDevice(dev);
      setTimeout(() => scheduleTick(dev), Math.random() * dev.st * 1000);
    }
    process.stdout.write(`\r  Connecting… ${Math.min(i + BATCH_SIZE, allDevices.length)}/${allDevices.length}`);
    await sleep(BATCH_DELAY_MS);
  }
  console.log(`\n  All ${allDevices.length} device clients initialised.\n`);

  setInterval(printStats, REPORT_EVERY_S * 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY
// ═══════════════════════════════════════════════════════════════════════════════

function connectMqtt() {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, {
      clientId:    `fleet-verify-${Date.now().toString(36)}`,
      username:    MQTT_USER,
      password:    MQTT_PASS,
      clean:       true,
      connectTimeout: 10_000,
      rejectUnauthorized: MQTT_REJECT_UNAUTHORIZED,
    });
    client.once('connect', () => resolve(client));
    client.once('error',   err => reject(err));
  });
}

function waitAck(client, match, timeoutMs) {
  return new Promise(resolve => {
    let done = false;
    const handler = (topic, payload) => {
      if (!done && match(topic, payload)) {
        done = true;
        client.removeListener('message', handler);
        resolve({ topic, payload, timedOut: false });
      }
    };
    client.on('message', handler);
    setTimeout(() => {
      if (!done) {
        done = true;
        client.removeListener('message', handler);
        resolve({ topic: null, payload: null, timedOut: true });
      }
    }, timeoutMs);
  });
}

function subscribeAsync(client, topic) {
  return new Promise((resolve, reject) =>
    client.subscribe(topic, { qos: 1 }, err => err ? reject(err) : resolve()));
}

async function test1(db) {
  console.log('\n[Test 1] DB Freshness — 20 sampled devices have meter_readings < 30s old');
  const sample = randomSample(allDeviceIds(), 20);
  const LIMIT  = 30_000;
  let pass = 0, fail = 0;

  for (const id of sample) {
    const [[row]] = await db.execute(
      'SELECT MAX(time) AS t FROM meter_readings WHERE device_id = ?', [id]);
    if (!row?.t) { console.log(`  FAIL  ${id} — no readings in DB`); fail++; continue; }
    const ageMs = Date.now() - new Date(row.t).getTime();
    if (ageMs <= LIMIT) { pass++; }
    else { console.log(`  FAIL  ${id} — last reading ${(ageMs / 1000).toFixed(0)}s ago`); fail++; }
  }

  const ok = fail === 0;
  console.log(`  → ${ok ? 'PASS' : 'FAIL'}  ${pass}/${sample.length} devices fresh`);
  return ok;
}

async function test2(client) {
  console.log('\n[Test 2] Command ACK — relay toggle roundtrip < 2s (5 devices)');
  const sample = randomSample(allDeviceIds(), 5);
  const LIMIT  = 2000;
  const results = [];

  await subscribeAsync(client, 'device/+/command_ack');

  for (const id of sample) {
    const t0  = Date.now();
    const ack = waitAck(client, topic => topic === `device/${id}/command_ack`, LIMIT + 1000);
    client.publish(`device/${id}/command`, encodeCommand(1, 1));
    const { timedOut } = await ack;
    const ms = Date.now() - t0;
    results.push({ id, ms, ok: !timedOut && ms <= LIMIT });
  }

  let passCount = 0;
  for (const { id, ms, ok } of results) {
    if (ok) passCount++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id} — ${ok ? ms + 'ms' : 'no ACK'}`);
  }
  const ok = passCount === sample.length;
  console.log(`  → ${ok ? 'PASS' : 'FAIL'}  ${passCount}/${sample.length} within ${LIMIT}ms`);
  return ok;
}

async function test3(client) {
  console.log('\n[Test 3] Config ACK — calibration push roundtrip < 2s (3 devices)');
  const sample = randomSample(allDeviceIds(), 3);
  const LIMIT  = 2000;
  const results = [];

  await subscribeAsync(client, 'device/+/config_ack');

  for (const id of sample) {
    const t0  = Date.now();
    const ack = waitAck(client, topic => topic === `device/${id}/config_ack`, LIMIT + 1000);
    client.publish(`device/${id}/config`, encodeConfig(4.55, 1.05, 5));
    const { timedOut } = await ack;
    const ms = Date.now() - t0;
    results.push({ id, ms, ok: !timedOut && ms <= LIMIT });
  }

  let passCount = 0;
  for (const { id, ms, ok } of results) {
    if (ok) passCount++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id} — ${ok ? ms + 'ms' : 'no ACK'}`);
  }
  const ok = passCount === sample.length;
  console.log(`  → ${ok ? 'PASS' : 'FAIL'}  ${passCount}/${sample.length} within ${LIMIT}ms`);
  return ok;
}

async function test4(client) {
  console.log('\n[Test 4] OTA ACK — flash simulation (2-5s) + reconnect + ACK < 15s');
  const [id]  = randomSample(allDeviceIds(), 1);
  const LIMIT = 15_000;

  await subscribeAsync(client, `device/${id}/ota_ack`);

  const t0  = Date.now();
  const ack = waitAck(client, topic => topic === `device/${id}/ota_ack`, LIMIT + 2000);
  client.publish(`device/${id}/ota`, encodeOta(2, 0, 0, 'https://firmware.example.com/sim-v2.0.0.bin'));
  console.log(`  OTA command sent to ${id}. Waiting…`);

  const { timedOut, payload } = await ack;
  const ms = Date.now() - t0;

  if (timedOut) { console.log(`  FAIL  ${id} — no ACK within ${LIMIT / 1000}s`); return false; }

  let version = '?';
  try { version = JSON.parse(payload.toString()).version; } catch {}
  const ok = ms <= LIMIT;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id} — v${version} in ${(ms / 1000).toFixed(2)}s`);
  return ok;
}

async function test5(client, db) {
  console.log('\n[Test 5] Anomaly Detection — mcb_trip (p=1450W > 1300W) detected < 90s');
  const [id]  = randomSample(allDeviceIds(), 1);
  const LIMIT = 90_000;
  const t0    = Date.now();

  client.publish(`device/${id}/data`, encode({ et: 200, p: 300, v: 220, c: 1.36, wf: 1.0, wt: 20, te: 50, tw: 10, rs: 1, vs: 1 }));
  await sleep(2000);
  client.publish(`device/${id}/data`, encode({ et: 200.01, p: 1450, v: 218, c: 6.65, wf: 1.0, wt: 20.001, te: 50, tw: 10, rs: 1, vs: 1 }));
  console.log(`  Anomaly frame sent to ${id}. Polling DB…`);

  const deadline = t0 + LIMIT;
  while (Date.now() < deadline) {
    await sleep(3000);
    try {
      const since = new Date(t0).toISOString().slice(0, 19).replace('T', ' ');
      const [[row]] = await db.execute(
        `SELECT id, created_at FROM anomalies
          WHERE device_id = ? AND type = 'mcb_trip' AND created_at >= ?
          ORDER BY created_at DESC LIMIT 1`,
        [id, since]);
      if (row) {
        const latMs = new Date(row.created_at).getTime() - t0;
        const ok    = latMs <= LIMIT;
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id} — detected in ${(latMs / 1000).toFixed(1)}s`);
        return ok;
      }
    } catch {}
  }

  console.log(`  FAIL  ${id} — no anomaly record after ${LIMIT / 1000}s`);
  return false;
}

async function test6(db) {
  console.log('\n[Test 6] Fleet Coverage — ≥ 95% of devices have readings in DB (last 60s)');
  const since = new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const [[{ active }]] = await db.execute(
    'SELECT COUNT(DISTINCT device_id) AS active FROM meter_readings WHERE time >= ?', [since]);
  const pct = ((active / TOTAL) * 100).toFixed(1);
  const ok  = active >= Math.floor(TOTAL * 0.95);
  console.log(`  Active devices : ${active} / ${TOTAL}  (${pct}%)`);
  console.log(`  → ${ok ? 'PASS' : 'FAIL'}  threshold: 95%`);
  return ok;
}

async function cmdVerify(argv) {
  const tIdx   = argv.indexOf('--test');
  const tArg   = tIdx >= 0 ? (argv[tIdx + 1] || 'all') : 'all';
  const runSet = tArg === 'all'
    ? new Set([1, 2, 3, 4, 5, 6])
    : new Set(tArg.split(',').map(Number));

  console.log('══════════════════════════════════════════════════════');
  console.log(' Fleet Verification Suite');
  console.log(`  Broker : ${BROKER_URL}`);
  console.log(`  Fleet  : ${TOTAL} devices`);
  console.log(`  Tests  : ${tArg}`);
  console.log('══════════════════════════════════════════════════════\n');

  console.log('Connecting…');
  const [mqttClient, db] = await Promise.all([connectMqtt(), mysql.createConnection(dbConfig())]);
  console.log('Connected.\n');

  const results = {};
  try {
    if (runSet.has(1)) results['1_db_freshness'] = await test1(db);
    if (runSet.has(2)) results['2_command_ack']  = await test2(mqttClient);
    if (runSet.has(3)) results['3_config_ack']   = await test3(mqttClient);
    if (runSet.has(4)) results['4_ota_ack']      = await test4(mqttClient);
    if (runSet.has(5)) results['5_anomaly']      = await test5(mqttClient, db);
    if (runSet.has(6)) results['6_coverage']     = await test6(db);
  } finally {
    mqttClient.end(true);
    await db.end();
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(' Summary');
  for (const [name, ok] of Object.entries(results))
    console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}  ${name}`);
  const allOk = Object.values(results).every(Boolean);
  console.log(`\n  Overall : ${allOk ? 'ALL PASS' : 'SOME FAILURES'}`);
  console.log('══════════════════════════════════════════════════════');
  process.exit(allOk ? 0 : 1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════════

const [,, sub, ...rest] = process.argv;

const USAGE = `
Usage:
  node scripts/fleet.js seed   [--dry-run] [--reset-existing]
  node scripts/fleet.js sim    [--count N] [--interval-ms MS] [--no-db-hydrate]
  node scripts/fleet.js verify [--test 1,3,5]
`.trim();

const CMDS = { seed: cmdSeed, sim: cmdSim, verify: cmdVerify };

if (!sub || !CMDS[sub]) {
  console.error(`Unknown subcommand: ${sub || '(none)'}\n\n${USAGE}`);
  process.exit(1);
}

CMDS[sub](rest).catch(err => { console.error('[FATAL]', err.message); process.exit(1); });
