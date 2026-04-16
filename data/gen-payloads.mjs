/**
 * Generates payload samples for the three MQTT topics used by TA-Flowmeter.
 * Run from repo root:  node data/gen-payloads.mjs
 *
 * ALL three payloads now use custom binary encoding — zero external libraries,
 * no key names, no type tags.
 *
 * ─── Wire formats ────────────────────────────────────────────────────────────
 *
 *  TELEMETRY  device/{id}/data          device → backend   21 bytes
 *    [0:3]  uint32 BE  et × 100     energy_total (kWh, 0.01)
 *    [4:5]  uint16 BE  p  × 10      power (W, 0.1)
 *    [6:7]  uint16 BE  v  × 10      voltage (V, 0.1)
 *    [8:9]  uint16 BE  c  × 1000    current (A, 0.001)
 *   [10:11] uint16 BE  wf × 100     water_flow (L/min, 0.01)
 *   [12:15] uint32 BE  wt × 1000    water_total (m³, 0.001)
 *   [16:19] uint32 BE  b            balance (Rp, integer)
 *   [20]    uint8      flags        bit0=relay_status, bit1=valve_status
 *
 *  COMMAND    device/{id}/command       backend → device    1 byte
 *    bits [7:4] = type   0x1=relay  0x2=valve
 *    bits [3:0] = value  0=off/close  1=on/open
 *
 *  CALIBRATION  device/{id}/config      backend → device    4 bytes
 *    [0:1] uint16 BE  CAL_FACTOR_FLOWRATE × 100   (0–500)
 *    [2]   uint8      CAL_FACTOR_POWER    × 100   (0–200)
 *    [3]   uint8      SENSOR_SAMPLING_TIME        (1–10)
 */

import { writeFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const OUT = dirname(fileURLToPath(import.meta.url));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function u16be(val) {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16BE(Math.round(val));
  return b;
}
function u32be(val) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32BE(Math.round(val));
  return b;
}

// ─── 1. TELEMETRY  (21 bytes) ─────────────────────────────────────────────────
const tel = {
  et: 12.347, p: 220.50, v: 219.8, c: 1.003,
  wf: 2.560, wt: 1.234, b: 45500, rs: 1, vs: 1,
};

const telBin = Buffer.concat([
  u32be(tel.et * 100),   // [0:3]  energy_total
  u16be(tel.p  * 10),    // [4:5]  power
  u16be(tel.v  * 10),    // [6:7]  voltage
  u16be(tel.c  * 1000),  // [8:9]  current
  u16be(tel.wf * 100),   // [10:11] water_flow
  u32be(tel.wt * 1000),  // [12:15] water_total
  u32be(tel.b),          // [16:19] balance
  Buffer.from([(tel.rs & 1) | ((tel.vs & 1) << 1)]), // [20] flags
]);

// JSON equivalent for comparison
const telJson = JSON.stringify({
  et: tel.et, p: tel.p, v: tel.v, c: tel.c,
  rs: tel.rs, wt: tel.wt, wf: tel.wf, vs: tel.vs, b: tel.b,
});

// ─── 2. COMMAND  (1 byte) ────────────────────────────────────────────────────
function encodeCommand(type, value) {
  const typeNibble = type === 'relay' ? 0x10 : 0x20;
  return Buffer.from([typeNibble | (value & 0x0f)]);
}

const cmdBin  = encodeCommand('relay', 0);   // 0x10 = relay OFF
const cmdJson = JSON.stringify({ r: 0 });

// ─── 3. CALIBRATION  (4 bytes) ───────────────────────────────────────────────
function encodeCalibration(cf, cp, st) {
  const buf = Buffer.allocUnsafe(4);
  buf.writeUInt16BE(Math.round(cf * 100), 0);
  buf[2] = Math.round(cp * 100);
  buf[3] = st;
  return buf;
}

const calBin  = encodeCalibration(4.55, 1.05, 5);
const calJson = JSON.stringify({ cf: 4.55, cp: 1.05, st: 5 });

// ─── Write files ──────────────────────────────────────────────────────────────
writeFileSync(`${OUT}/payload_telemetry.json`,   telJson + '\n', 'utf8');
writeFileSync(`${OUT}/payload_telemetry.bin`,    telBin);
writeFileSync(`${OUT}/payload_command.json`,     cmdJson + '\n', 'utf8');
writeFileSync(`${OUT}/payload_command.bin`,      cmdBin);
writeFileSync(`${OUT}/payload_calibration.json`, calJson + '\n', 'utf8');
writeFileSync(`${OUT}/payload_calibration.bin`,  calBin);

// Delete old .msgpack files if present
import { existsSync, unlinkSync } from 'fs';
for (const name of ['telemetry', 'command', 'calibration']) {
  const f = `${OUT}/payload_${name}.msgpack`;
  if (existsSync(f)) { unlinkSync(f); }
}

// ─── Print comparison ─────────────────────────────────────────────────────────
const W = 72;
console.log('\n  TA-Flowmeter MQTT Payload Size Comparison  (all custom binary)\n');
console.log('  ' + '─'.repeat(W));
console.log(
  `  ${'Payload'.padEnd(14)}` +
  `${'JSON (B)'.padStart(9)}` +
  `${'Binary (B)'.padStart(11)}` +
  `${'Savings'.padStart(9)}` +
  `  Wire format`
);
console.log('  ' + '─'.repeat(W));

const rows = [
  { name: 'telemetry',   jsonLen: Buffer.from(telJson).length, binLen: telBin.length,
    wire: '21B packed frame — uint32/uint16/uint8 BE + flags byte' },
  { name: 'command',     jsonLen: Buffer.from(cmdJson).length, binLen: cmdBin.length,
    wire: '1B — nibble[7:4]=type, nibble[3:0]=value' },
  { name: 'calibration', jsonLen: Buffer.from(calJson).length, binLen: calBin.length,
    wire: '4B — uint16+uint8+uint8' },
];

for (const r of rows) {
  const pct = (((r.jsonLen - r.binLen) / r.jsonLen) * 100).toFixed(1);
  console.log(
    `  ${r.name.padEnd(14)}` +
    `${String(r.jsonLen).padStart(9)}` +
    `${String(r.binLen).padStart(11)}` +
    `${(pct + '%').padStart(9)}` +
    `  ${r.wire}`
  );
}
console.log('  ' + '─'.repeat(W));

console.log('\n  Telemetry decode (Node.js / backend):');
console.log('  et = buf.readUInt32BE(0)  / 100');
console.log('  p  = buf.readUInt16BE(4)  / 10');
console.log('  v  = buf.readUInt16BE(6)  / 10');
console.log('  c  = buf.readUInt16BE(8)  / 1000');
console.log('  wf = buf.readUInt16BE(10) / 100');
console.log('  wt = buf.readUInt32BE(12) / 1000');
console.log('  b  = buf.readUInt32BE(16)');
console.log('  rs = buf[20] & 1  ;  vs = (buf[20] >> 1) & 1');
console.log('');
console.log('  Telemetry encode (ESP32 / C):');
console.log('  writeU32BE(buf+0,  (uint32_t)(et * 100  + 0.5f))');
console.log('  writeU16BE(buf+4,  (uint16_t)(p  * 10   + 0.5f))');
console.log('  writeU16BE(buf+6,  (uint16_t)(v  * 10   + 0.5f))');
console.log('  writeU16BE(buf+8,  (uint16_t)(c  * 1000 + 0.5f))');
console.log('  writeU16BE(buf+10, (uint16_t)(wf * 100  + 0.5f))');
console.log('  writeU32BE(buf+12, (uint32_t)(wt * 1000 + 0.5f))');
console.log('  writeU32BE(buf+16, (uint32_t)(b         + 0.5f))');
console.log('  buf[20] = (rs & 1) | ((vs & 1) << 1)');
console.log('');
