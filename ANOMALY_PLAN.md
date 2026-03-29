# Anomaly Notification System — Full Plan

## Overview

This document covers the full anomaly detection and notification system for TA-Flowmeter.

**How detection works:**
- **Device commands** (relay OFF for Jailbreak, MCB Trip, Overvoltage): fire immediately on every MQTT telemetry via `checkOnTelemetry` — work even when the app is closed.
- **Notification cache**: `AnomalyService` runs a background job every **2 minutes** (`OnModuleInit` + `setInterval`) refreshing anomaly state for all units. Cache is also updated per-unit every 30 s when telemetry arrives (throttled). Mobile app polls `GET /anomalies` every 30 s and gets the pre-computed cache instantly.
- **On app open**: resident sees the last computed state (at most 2 min stale).
- **No DB table required**: detection queries the existing `meter_readings` and `units` tables — one query of 60 rows per unit per check cycle.

---

## Available Data Sources

| Source | Fields |
|--------|--------|
| `meter_readings` | `time`, `device_id`, `voltage`, `current`, `power`, `water_flow`, `energy_total` |
| `units` | `balance`, `relay_status`, `last_energy_reading`, `energy_tariff`, `last_water_reading`, `water_tariff` |
| MQTT publish | `device/{id}/relay/set` — backend → device command |

---

## Anomaly Catalog (11 Total)

### Anomali 1 — Jailbreak (Bypass Sistem)

| Field | Detail |
|-------|--------|
| **Precondition** | Saldo habis (balance ≤ 0), relay sudah dimatikan sistem, tapi sensor masih melaporkan konsumsi |
| **Detection** | `balance ≤ 0` AND `relay_status = false` AND (`power > 5 W` OR `water_flow > 0.1 L/min`) |
| **Trigger** | Per-telemetry (`checkOnTelemetry`) + background cache refresh |
| **Warning** | Admin only (tidak tampil di aplikasi penghuni) |
| **Mitigation** | Backend emit `relay: OFF, reason: JAILBREAK_DETECTED` via MQTT |
| **Handling** | Admin verifikasi kondisi fisik relay, laporkan ke teknisi |
| **Prevention** | Pastikan relay fisik bekerja; pertimbangkan sensor arus independen |
| **Device Response** | **YA** — `device/{id}/relay/set` → `{ relay: 'OFF', reason: 'JAILBREAK_DETECTED' }` |
| **Target** | Admin only |

---

### Anomali 2 — Kebocoran Air (Water Leak)

| Field | Detail |
|-------|--------|
| **Precondition** | Debit air mengalir konstan tanpa henti dalam waktu panjang |
| **Detection** | 60 readings terakhir: ≥90% non-zero, mean ≥ 0.3 L/min, CoV = stddev/mean < 0.20 |
| **Statistical Basis** | CoV pemakaian normal ≈ 0.5–1.5 (berfluktuasi). CoV kebocoran < 0.20 (konstan) |
| **Trigger** | Background cache + per-GET request |
| **Warning** | Admin + Penghuni |
| **Mitigation** | Tidak ada aksi otomatis (false positive terlalu berisiko) |
| **Handling** | Penghuni periksa pipa, kran, toilet. Jika tidak ditemukan → hubungi teknisi |
| **Prevention** | Pasang pelampung/pressure sensor tambahan; inspeksi berkala instalasi |
| **Device Response** | **TIDAK** |
| **Target** | Both |

---

### Anomali 3 — Perangkat Offline (Device Offline)

| Field | Detail |
|-------|--------|
| **Precondition** | Tidak ada data masuk dari perangkat |
| **Detection** | `(NOW - last reading.time) > 10 menit` |
| **Trigger** | Background cache refresh |
| **Warning** | Admin only |
| **Mitigation** | Tidak ada (tidak dapat dijangkau) |
| **Handling** | Admin cek koneksi jaringan unit, power supply, restart perangkat |
| **Prevention** | Koneksi redundant (WiFi + GSM backup); watchdog timer di firmware |
| **Device Response** | **TIDAK** — tidak dapat dijangkau |
| **Target** | Admin only |

---

### Anomali 4 — MCB Trip (Overload Listrik)

| Field | Detail |
|-------|--------|
| **Precondition** | Daya aktif melebihi kapasitas MCB standar |
| **Detection** | `latest.power > 1300 W` |
| **Trigger** | Per-telemetry (`checkOnTelemetry`) + background cache |
| **Warning** | Admin + Penghuni |
| **Mitigation** | Backend emit relay OFF → mencegah kerusakan saat MCB reset |
| **Handling** | Kurangi beban listrik, lalu nyalakan ulang relay dari aplikasi |
| **Prevention** | Hindari menghidupkan beberapa peralatan daya tinggi bersamaan |
| **Device Response** | **YA** — `device/{id}/relay/set` → `{ relay: 'OFF', reason: 'MCB_TRIP' }` |
| **Target** | Both |

---

### Anomali 5 — Saldo Hampir Habis (Low Balance)

| Field | Detail |
|-------|--------|
| **Precondition** | Saldo mendekati batas minimum sebelum pemutusan |
| **Detection** | `unit.balance > 0` AND `unit.balance < Rp 20.000` |
| **Trigger** | Background cache |
| **Warning** | Penghuni (reminder top-up) |
| **Mitigation** | Tidak ada aksi otomatis |
| **Handling** | Top-up via menu Beli Token |
| **Prevention** | Notifikasi rutin; pertimbangkan auto top-up |
| **Device Response** | **TIDAK** |
| **Target** | Resident only |

---

### Anomali 6 — Tegangan Tidak Normal (Voltage Anomaly)

| Field | Detail |
|-------|--------|
| **Precondition** | Tegangan di luar rentang aman standar PLN (220V ±10%) |
| **Detection** | `voltage < 198 V` (undervoltage) OR `voltage > 242 V` (overvoltage) |
| **Severity** | `critical` jika `< 180 V` atau `> 250 V`; `warning` untuk 180–198 V atau 242–250 V |
| **Trigger** | Per-telemetry (critical overvoltage → relay OFF); background cache |
| **Warning** | Admin + Penghuni |
| **Mitigation** | Critical overvoltage (>250V): backend emit relay OFF untuk lindungi peralatan |
| **Handling** | Hentikan pemakaian perangkat sensitif; laporkan ke PLN/teknisi |
| **Prevention** | Pasang AVR/stabilizer; UPS untuk perangkat kritikal |
| **Device Response** | **YA** hanya untuk critical overvoltage `> 250V` — `{ relay: 'OFF', reason: 'OVERVOLTAGE' }` |
| **Target** | Both |

---

### Anomali 7 — Sensor Tidak Berfungsi (Sensor Malfunction)

| Field | Detail |
|-------|--------|
| **Precondition** | Perangkat online tapi semua nilai sensor null |
| **Detection** | 5+ readings terakhir: `power = null` AND `voltage = null` AND `water_flow = null` semua |
| **Trigger** | Background cache |
| **Warning** | Admin + Penghuni |
| **Mitigation** | Jika sensor malfunction terdeteksi, skip semua anomaly check lain (data tidak dapat dipercaya) |
| **Handling** | Hubungi teknisi untuk inspeksi sensor dan koneksi kabel |
| **Prevention** | Gunakan sensor dengan self-diagnostic; cek konektor secara berkala |
| **Device Response** | **TIDAK** |
| **Target** | Both |

---

### Anomali 8 — Faktor Daya Rendah (Low Power Factor)

| Field | Detail |
|-------|--------|
| **Precondition** | Beban induktif berlebih pada instalasi listrik unit |
| **Detection** | `PF = power / (voltage × current) < 0.60` dan `power > 50 W` dan `current > 0.1 A` |
| **Trigger** | Background cache |
| **Warning** | Admin + Penghuni |
| **Mitigation** | Tidak ada aksi otomatis |
| **Handling** | Kurangi beban induktif (motor, AC lama); pasang kapasitor koreksi |
| **Prevention** | Gunakan peralatan dengan PF tinggi (label energy star); jangan overload |
| **Device Response** | **TIDAK** |
| **Target** | Both |

---

### Anomali 9 — Tidak Ada Aliran Air (Extended Zero Flow)

| Field | Detail |
|-------|--------|
| **Precondition** | Relay ON, saldo ada, tapi tidak ada aliran air dalam waktu lama |
| **Detection** | 20 readings terakhir: semua `water_flow ≤ 0.05 L/min` (15+ readings valid), relay ON, balance > 0 |
| **Trigger** | Background cache |
| **Warning** | Admin + Penghuni |
| **Mitigation** | Tidak ada aksi otomatis |
| **Handling** | Periksa katup, pipa, dan suplai air dari pengelola gedung |
| **Prevention** | Pastikan instalasi katup/valve dalam kondisi baik; cek supply air gedung |
| **Device Response** | **TIDAK** |
| **Target** | Both |

---

### Anomali 10 — Lonjakan Konsumsi (Usage Spike)

| Field | Detail |
|-------|--------|
| **Precondition** | Tiba-tiba ada lonjakan daya yang jauh di atas baseline unit itu sendiri |
| **Detection** | `current_power > 3× avg(prev 20–60 readings)` AND `avg > 100 W` AND `current > 500 W` |
| **Trigger** | Background cache |
| **Warning** | Admin + Penghuni |
| **Mitigation** | Tidak ada aksi otomatis |
| **Handling** | Periksa perangkat yang baru dinyalakan; matikan yang tidak diperlukan |
| **Prevention** | Hindari menghidupkan banyak peralatan daya tinggi sekaligus |
| **Device Response** | **TIDAK** |
| **Target** | Both |

---

### Anomali 11 — Aliran Air Balik (Backflow)

| Field | Detail |
|-------|--------|
| **Precondition** | Nilai debit air negatif terdeteksi dari sensor |
| **Detection** | `latest.water_flow < -0.1 L/min` |
| **Trigger** | Background cache |
| **Warning** | Admin + Penghuni |
| **Mitigation** | Tidak ada aksi otomatis |
| **Handling** | Laporkan ke pengelola — kemungkinan masalah instalasi pipa atau pemasangan meter terbalik |
| **Prevention** | Pasang check valve (katup satu arah) di instalasi pipa unit |
| **Device Response** | **TIDAK** |
| **Target** | Both |

---

## Device Response Summary

| Anomali | Trigger | MQTT Topic | Payload |
|---------|---------|-----------|---------|
| Jailbreak | Per-telemetry | `device/{id}/relay/set` | `{ relay:'OFF', reason:'JAILBREAK_DETECTED' }` |
| MCB Trip | Per-telemetry | `device/{id}/relay/set` | `{ relay:'OFF', reason:'MCB_TRIP' }` |
| Overvoltage >250V | Per-telemetry | `device/{id}/relay/set` | `{ relay:'OFF', reason:'OVERVOLTAGE' }` |
| Water Leak | — | — | — |
| Device Offline | — | — | — |
| Low Balance | — | — | — |
| Voltage Warning | — | — | — |
| Sensor Malfunction | — | — | — |
| Low Power Factor | — | — | — |
| Zero Flow | — | — | — |
| Usage Spike | — | — | — |
| Backflow | — | — | — |

---

## Visibility by Role

| Anomali | Resident | Admin |
|---------|----------|-------|
| 1 Jailbreak | ✗ | ✓ |
| 2 Water Leak | ✓ | ✓ |
| 3 Device Offline | ✗ | ✓ |
| 4 MCB Trip | ✓ | ✓ |
| 5 Low Balance | ✓ | ✗ |
| 6 Voltage Anomaly | ✓ | ✓ |
| 7 Sensor Malfunction | ✓ | ✓ |
| 8 Low Power Factor | ✓ | ✓ |
| 9 Zero Flow | ✓ | ✓ |
| 10 Usage Spike | ✓ | ✓ |
| 11 Backflow | ✓ | ✓ |

---

## Detection Timing

```
[IoT Device] ──MQTT telemetry──► [DeviceService.saveSensorData()]
                                          │
                                          ▼ (immediately, non-blocking)
                               [AnomalyService.checkOnTelemetry()]
                                  ├── Anomali 1: Jailbreak → relay OFF
                                  ├── Anomali 4: MCB Trip → relay OFF
                                  ├── Anomali 6: Overvoltage → relay OFF
                                  └── Throttled cache refresh (max 1/30s per unit)

[Background job] ──every 2 min──► [AnomalyService.refreshAllUnitsCache()]
                                  └── computeAll() for every unit → update cache

[Mobile App] ──GET /anomalies every 30s──► Returns cached AnomalyItem[]
                                           (pre-computed, sub-millisecond response)
```

---

## Simulation Tool

**File:** `simulation/simulate.html`
- Open directly in browser (no server needed)
- Connects to EMQX WebSocket (`ws://localhost:8083/mqtt`)
- Buttons for all 11 anomaly scenarios
- Shows real-time log, sent count, and energy/water counters
- For scenarios requiring multiple readings (water leak, zero flow, sensor malfunction, usage spike): progress bar + auto-sends N readings with 200–300ms interval

**Prerequisites for specific scenarios:**
- Anomali 1 (Jailbreak): `UPDATE units SET balance = 0 WHERE unit_no = 'A-01';`
- Anomali 5 (Low Balance): `UPDATE units SET balance = 15000 WHERE unit_no = 'A-01';`

---

## Identified Gaps (Not Yet Implemented)

| Anomali | Reason Not Implemented |
|---------|----------------------|
| Valve Open + Zero Flow | No `valve_status` column in `units` table — can't distinguish closed valve from broken pipe |
| Token Fraud Double-spend | Would require transaction-level integrity check outside normal ingestion flow |
| Phase Imbalance (3-phase) | Single-phase meter only — no per-phase current data |
| Surge Protection Trip | Would need dedicated surge sensor or digital input from hardware |
