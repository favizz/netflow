/**
 * Custom binary protocol for device commands and calibration config.
 * Absolute minimum wire bytes - no key names, no type tags.
 *
 * ─────────────────────────────────────────────────────────────
 * COMMAND FRAME  (1 byte)
 *   bits [7:4]  type  : 0x1 = relay,  0x2 = valve
 *   bits [3:0]  value : 0x0 = off/close, 0x1 = on/open
 *
 *   relay on  → 0x11    relay off  → 0x10
 *   valve open → 0x21   valve close → 0x20
 *
 * ─────────────────────────────────────────────────────────────
 * CALIBRATION FRAME  (4 bytes)
 *   bytes [0:1]  uint16 BE : CAL_FACTOR_FLOWRATE × 100   (0–500)
 *   byte  [2]    uint8     : CAL_FACTOR_POWER    × 100   (0–200)
 *   byte  [3]    uint8     : SENSOR_SAMPLING_TIME        (1–10)
 *
 * Size vs JSON:
 *   command      1 B  vs  7–13 B JSON
 *   calibration  4 B  vs    30 B JSON
 *
 * Firmware decoder (C / ESP-IDF reference):
 *   uint8_t cmd = buf[0];
 *   uint8_t type = (cmd >> 4) & 0x0F;   // 1=relay, 2=valve
 *   uint8_t val  = cmd & 0x0F;          // 0=off, 1=on
 *
 *   uint16_t cf_x100 = (buf[0] << 8) | buf[1];
 *   float cf = cf_x100 / 100.0f;
 *   float cp = buf[2]  / 100.0f;
 *   uint8_t st = buf[3];
 */

// ─────────────────────────────────────────────────────────────
// OTA FRAME  (JSON, variable length)  server → device
//   topic: device/{id}/ota
//   {"url":"https://host/fw-v1.2.0.bin","version":"1.2.0","size":524288}
//   ESP32 uses HTTPUpdate to fetch and flash; auto-reboots on success.

// ─────────────────────────────────────────────────────────────
// TELEMETRY FRAME  (25 bytes)  device → backend
//   bytes  [0:3]  uint32 BE  et × 100     energy_total (kWh, 0.01 precision)
//   bytes  [4:5]  uint16 BE  p  × 10      power        (W,   0.1  precision)
//   bytes  [6:7]  uint16 BE  v  × 10      voltage      (V,   0.1  precision)
//   bytes  [8:9]  uint16 BE  c  × 1000    current      (A,   0.001 precision)
//   bytes [10:11] uint16 BE  wf × 100     water_flow   (L/min, 0.01 precision)
//   bytes [12:15] uint32 BE  wt × 1000    water_total  (m³,  0.001 precision)
//   bytes [16:19] uint32 BE  te × 1000    electricity token remaining (kWh)
//   bytes [20:23] uint32 BE  tw × 1000    water token remaining (m³)
//   byte  [24]    uint8      flags        bit0=relay_status, bit1=valve_status

export interface TelemetryPayload {
  et: number; // energy_total kWh
  p: number; // active_power W
  v: number; // voltage      V
  c: number; // current      A
  wf: number; // water_flow   L/min
  wt: number; // water_total  m³
  te: number; // electricity token remaining kWh
  tw: number; // water token remaining mÂ³
  rs: number; // relay_status 0|1
  vs: number; // valve_status 0|1
}

export function decodeTelemetry(buf: Buffer): TelemetryPayload {
  if (buf.length < 21) {
    throw new RangeError(`Telemetry frame too short: ${buf.length} bytes`);
  }

  const flagsOffset = buf.length >= 25 ? 24 : 20;

  return {
    et: buf.readUInt32BE(0) / 100,
    p: buf.readUInt16BE(4) / 10,
    v: buf.readUInt16BE(6) / 10,
    c: buf.readUInt16BE(8) / 1000,
    wf: buf.readUInt16BE(10) / 100,
    wt: buf.readUInt32BE(12) / 1000,
    te: buf.length >= 25 ? buf.readUInt32BE(16) / 1000 : 0,
    tw: buf.length >= 25 ? buf.readUInt32BE(20) / 1000 : 0,
    rs: buf[flagsOffset] & 1,
    vs: (buf[flagsOffset] >> 1) & 1,
  };
}

export function encodeTelemetry(t: TelemetryPayload): Buffer {
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

// ─────────────────────────────────────────────────────────────
export type CommandType = 'relay' | 'valve';

/**
 * Encode a relay or valve command into 1 byte.
 * @param type  'relay' | 'valve'
 * @param value  0 = off/close  |  1 = on/open
 */
export function encodeCommand(type: CommandType, value: 0 | 1): Buffer {
  const typeNibble = type === 'relay' ? 0x10 : 0x20;
  return Buffer.from([typeNibble | (value & 0x0f)]);
}

export interface CalibrationPayload {
  cf: number; // CAL_FACTOR_FLOWRATE   0 – 5.00
  cp: number; // CAL_FACTOR_POWER      0 – 2.00
  st: number; // SENSOR_SAMPLING_TIME  1 – 10
}

/**
 * Encode calibration settings into 4 bytes.
 */
export function encodeCalibration(payload: CalibrationPayload): Buffer {
  const buf = Buffer.allocUnsafe(4);
  buf.writeUInt16BE(Math.round(payload.cf * 100), 0);
  buf[2] = Math.round(payload.cp * 100);
  buf[3] = payload.st;
  return buf;
}

export interface OtaPayload {
  version: string; // semver "1.0.1"
  binaryLink: string; // full URL to .bin file (e.g. GitHub raw)
  updateNow?: boolean; // default true → flags byte 0x01
}

/**
 * Compact binary OTA frame - no JSON wrapper.
 *   byte[0]   major  (uint8)
 *   byte[1]   minor  (uint8)
 *   byte[2]   patch  (uint8)
 *   byte[3]   flags  0x01=update_now  0x02=force
 *   byte[4..N] binary_link as UTF-8 (length = frame.length − 4)
 *
 * ~4 + URL_len bytes vs ~150+ bytes for equivalent JSON.
 */
export function encodeOta(payload: OtaPayload): Buffer {
  const parts = payload.version.split('.').map(Number);
  const [maj = 0, min = 0, pat = 0] = parts;
  const flags = payload.updateNow !== false ? 0x01 : 0x00;
  const urlBytes = Buffer.from(payload.binaryLink, 'utf8');
  const buf = Buffer.allocUnsafe(4 + urlBytes.length);
  buf[0] = maj & 0xff;
  buf[1] = min & 0xff;
  buf[2] = pat & 0xff;
  buf[3] = flags;
  urlBytes.copy(buf, 4);
  return buf;
}

// ─────────────────────────────────────────────────────────────
// TOPUP FRAME (12 bytes) server → device
//   topic: device/{id}/topup
//   bytes  [0:3]  uint32 BE : electricity_amount (Rp) — 0 if none
//   bytes  [4:7]  uint32 BE : water_amount       (Rp) — 0 if none
//   bytes [8:11]  uint32 BE : timestamp (Unix epoch in seconds)
//
// Splitting electricity and water lets the device credit and
// cut off each utility independently.
// ─────────────────────────────────────────────────────────────

export interface TopupPayload {
  electricAmount: number;
  waterAmount: number;
  timestamp: number;
}

/**
 * Encode a top-up command into 12 bytes.
 */
export function encodeTopup(payload: TopupPayload): Buffer {
  const buf = Buffer.allocUnsafe(12);
  buf.writeUInt32BE(Math.round(payload.electricAmount), 0);
  buf.writeUInt32BE(Math.round(payload.waterAmount), 4);
  buf.writeUInt32BE(payload.timestamp, 8);
  return buf;
}
