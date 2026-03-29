# Anomaly Notification System — Full Plan

## Overview

This document covers the full anomaly detection and notification system for the TA-Flowmeter mobile app. Anomalies are computed on-demand from live sensor data and unit state. No separate database table is required — detection queries the existing `meter_readings` and `units` tables.

---

## Available Data Sources

| Source | Fields |
|--------|--------|
| `meter_readings` | `time`, `device_id`, `voltage`, `current`, `power`, `water_flow`, `energy_total` |
| `units` | `balance`, `relay_status`, `last_energy_reading`, `energy_tariff`, `last_water_reading`, `water_tariff` |
| MQTT topics | `device/{id}/telemetry` (live), `device/{id}/relay/set` (command out) |

---

## Anomaly Catalog

### Anomali 1 — Jailbreak (Bypass Sistem)

| Field | Detail |
|-------|--------|
| **Precondition** | Saldo habis (balance ≤ 0), relay sudah dimatikan oleh sistem, tapi sensor masih melaporkan konsumsi |
| **Detection** | `balance ≤ 0` AND `relay_status = false` AND (`power > 5 W` OR `water_flow > 0.1 L/min`) |
| **Trigger** | Setiap kali data telemetri masuk (real-time via `DeviceService.saveSensorData`) |
| **Warning** | Notifikasi dikirim ke Admin saja (tidak tampil di aplikasi penghuni) |
| **Mitigation** | Sistem otomatis mengirim ulang perintah `relay: OFF` ke perangkat via MQTT (`device/{id}/relay/set`) |
| **Handling** | Admin memverifikasi kondisi fisik relay di unit, laporkan ke teknisi |
| **Prevention** | Pastikan relay fisik bekerja dengan baik; pertimbangkan sensor arus independen sebagai verifikasi ganda |
| **Device Response** | **YA** — MQTT publish `device/{id}/relay/set` → `{ relay: 'OFF', reason: 'JAILBREAK_DETECTED' }` |
| **Target** | Admin only |

---

### Anomali 2 — Kebocoran Air (Water Leak)

| Field | Detail |
|-------|--------|
| **Precondition** | Saldo ada, debit air mengalir secara konstan tanpa pernah berhenti dalam rentang waktu panjang |
| **Detection** | Ambil 60 pembacaan `water_flow` terakhir. Jika ≥90% bernilai > 0, rata-rata ≥ 0.3 L/menit, dan Koefisien Variasi (CoV = stddev/mean) < 0.20 → kebocoran |
| **Statistical Test** | CoV < 0.20 berarti debit sangat konstan (tidak berfluktuasi seperti pemakaian normal). CoV normal pemakaian manusia ≈ 0.5–1.5 |
| **Trigger** | Setiap GET `/anomalies` request (on-demand) — tidak real-time per telemetri karena membutuhkan query agregat |
| **Warning** | Notifikasi tampil di aplikasi penghuni dan Admin |
| **Mitigation** | Sistem tidak menutup valve secara otomatis (false positive terlalu berisiko). Penghuni diinformasikan untuk memeriksa |
| **Handling** | Penghuni segera memeriksa kondisi pipa, kran, dan toilet. Jika tidak ditemukan penyebab, hubungi teknisi |
| **Prevention** | Pasang pelampung / pressure sensor tambahan di pipa utama unit; inspeksi berkala instalasi air |
| **Device Response** | **TIDAK** — tidak ada perintah otomatis dikirim ke perangkat |
| **Target** | Admin + Penghuni |

---

### Anomali 3 — Perangkat Offline (Device Offline)

| Field | Detail |
|-------|--------|
| **Precondition** | Perangkat IoT di unit tidak mengirimkan data melebihi batas waktu |
| **Detection** | `(NOW - last meter_reading.time) > 10 menit` |
| **Threshold** | 10 menit (bukan 5 menit untuk mengurangi false positive akibat delay jaringan) |
| **Trigger** | Setiap GET `/anomalies` request (on-demand) |
| **Warning** | Notifikasi ke Admin saja (penghuni tidak perlu mengetahui detail teknis ini) |
| **Mitigation** | Tidak ada aksi otomatis — perangkat tidak dapat dijangkau jika offline |
| **Handling** | Admin mengecek koneksi jaringan unit, cek power supply perangkat, restart perangkat secara manual jika perlu |
| **Prevention** | Gunakan koneksi jaringan yang redundant (WiFi + GSM backup); pasang watchdog timer di firmware |
| **Device Response** | **TIDAK** — perangkat tidak dapat dijangkau saat offline |
| **Target** | Admin only |

---

### Anomali 4 — MCB Trip (Overload Listrik)

| Field | Detail |
|-------|--------|
| **Precondition** | Daya aktif melebihi kapasitas MCB standar 1300 Watt |
| **Detection** | `latest.power > 1300 W` |
| **Trigger** | Setiap kali data telemetri masuk (real-time via `DeviceService.saveSensorData`) |
| **Warning** | Notifikasi tampil di aplikasi penghuni dan Admin |
| **Mitigation** | Sistem otomatis mengirim perintah `relay: OFF` ke perangkat via MQTT untuk mencegah kerusakan saat MCB reset |
| **Handling** | Penghuni mengurangi beban listrik (cabut peralatan daya tinggi), lalu nyalakan kembali relay dari aplikasi |
| **Prevention** | Hindari menghidupkan beberapa peralatan daya tinggi bersamaan (AC + water heater + microwave dll) |
| **Device Response** | **YA** — MQTT publish `device/{id}/relay/set` → `{ relay: 'OFF', reason: 'MCB_TRIP' }` |
| **Target** | Admin + Penghuni |

---

### Anomali 5 — Saldo Hampir Habis (Low Balance)

| Field | Detail |
|-------|--------|
| **Precondition** | Saldo ada namun mendekati batas minimum sebelum pemutusan |
| **Detection** | `unit.balance > 0` AND `unit.balance < Rp 20.000` |
| **Trigger** | Setiap GET `/anomalies` request (on-demand) |
| **Warning** | Notifikasi tampil di aplikasi penghuni (reminder top-up) |
| **Mitigation** | Tidak ada aksi otomatis — hanya peringatan dini |
| **Handling** | Penghuni segera melakukan top-up token melalui menu "Beli Token" |
| **Prevention** | Aktifkan notifikasi secara rutin; pertimbangkan fitur auto top-up di masa mendatang |
| **Device Response** | **TIDAK** |
| **Target** | Penghuni (resident) |

---

### Anomali 6 — Tegangan Tidak Normal (Voltage Anomaly)

| Field | Detail |
|-------|--------|
| **Precondition** | Tegangan listrik di luar rentang aman standar PLN Indonesia |
| **Detection** | `voltage < 198 V` (undervoltage) OR `voltage > 242 V` (overvoltage). Standar ±10% dari 220 V |
| **Severity** | `critical` jika `voltage < 180 V` atau `voltage > 250 V`; `warning` untuk range 180–198 atau 242–250 |
| **Trigger** | Setiap GET `/anomalies` request, berdasarkan pembacaan terbaru |
| **Warning** | Notifikasi tampil di aplikasi penghuni dan Admin |
| **Mitigation** | Tidak ada perintah relay otomatis untuk warning biasa. Untuk kondisi kritis (> 250V), relay OFF dikirim |
| **Handling** | Penghuni hentikan pemakaian perangkat sensitif (TV, laptop, kulkas). Laporkan ke PLN/teknisi |
| **Prevention** | Pasang stabilizer tegangan (AVR) untuk perangkat sensitif; pertimbangkan UPS untuk backup |
| **Device Response** | **TIDAK** (untuk warning); **YA** untuk critical overvoltage > 250V — MQTT `relay: OFF, reason: 'OVERVOLTAGE'` |
| **Target** | Admin + Penghuni |

---

## Anomali Yang Belum Dicakup (Identified Gaps)

| Anomali | Alasan Belum Diimplementasi |
|---------|----------------------------|
| **Sensor Malfunction** | Semua readings NULL atau stuck di nilai sama selama N waktu — indikasi kerusakan sensor hardware. Perlu data historis lebih kompleks. |
| **Power Factor Rendah** | Rasio `power / (voltage × current)` jauh di bawah 0.8 — beban induktif/kapasitif tidak efisien. Data ada tapi threshold perlu kalibrasi. |
| **Valve Open + Zero Flow** | Valve dibuka tapi water_flow = 0 — pipa tersumbat atau tidak ada suplai. Butuh valve_status di DB yang saat ini belum ada. |
| **Token Usage Spike** | Konsumsi kWh per jam tiba-tiba melonjak 3× rata-rata — kemungkinan alat rusak atau aksi tidak normal. Butuh baseline historis per unit. |
| **Backflow / Negative Flow** | water_flow bernilai negatif — kemungkinan meter terpasang terbalik atau backflow. Butuh validasi nilai sensor. |

---

## Device Response Summary

| Anomali | MQTT Command | Topic | Payload |
|---------|-------------|-------|---------|
| Jailbreak | relay OFF | `device/{id}/relay/set` | `{ relay: 'OFF', reason: 'JAILBREAK_DETECTED' }` |
| MCB Trip | relay OFF | `device/{id}/relay/set` | `{ relay: 'OFF', reason: 'MCB_TRIP' }` |
| Voltage Critical (>250V) | relay OFF | `device/{id}/relay/set` | `{ relay: 'OFF', reason: 'OVERVOLTAGE' }` |
| Water Leak | none | — | — |
| Device Offline | none | — | — |
| Low Balance | none | — | — |
| Voltage Warning | none | — | — |

---

## Architecture

```
[IoT Sensor] ──MQTT telemetry──► [DeviceService.saveSensorData()]
                                          │
                                          ▼
                               [AnomalyService.checkOnTelemetry()]
                                  ├── Jailbreak check → MQTT relay OFF
                                  └── MCB trip check → MQTT relay OFF

[Mobile App] ──GET /anomalies──► [GatewayController]
                                         │
                                         ▼
                              [AnomalyService.getAnomaliesForUnit()]
                                 ├── Low Balance (from units table)
                                 ├── MCB Trip (latest power reading)
                                 ├── Voltage Anomaly (latest voltage)
                                 └── Water Leak (last 60 readings, CoV test)
                                 (Jailbreak + Offline excluded from resident view)
```

**Why on-demand (no DB table):**
- Avoids schema migration at this phase
- Anomaly state is always fresh — no stale cached records
- Single-building scale: query of 60 rows is sub-millisecond
- Tradeoff: no anomaly history log — acceptable for current scope

---

## Execution Steps

| Step | File | Action |
|------|------|--------|
| 1 | `src/anomaly/anomaly.types.ts` | Define `AnomalyItem`, `AnomalyType`, `AnomalySeverity` |
| 2 | `src/anomaly/anomaly.service.ts` | Detection logic, CoV test, MQTT commands |
| 3 | `src/anomaly/anomaly.module.ts` | NestJS module wiring |
| 4 | `src/device/device.service.ts` | Inject AnomalyService, call checkOnTelemetry post-commit |
| 5 | `src/device/device.module.ts` | Import AnomalyModule |
| 6 | `src/gateway/gateway.service.ts` | Add getMobileAnomalies(), update getMobileDashboard |
| 7 | `src/gateway/gateway.controller.ts` | Add GET /anomalies endpoint |
| 8 | `src/gateway/gateway.module.ts` | Import AnomalyModule |
| 9 | `src/app.module.ts` | Import AnomalyModule |
| 10 | `mobile/src/lib/api.ts` | Add AnomalyItem type + getAnomalies() |
| 11 | `mobile/src/App.tsx` | Update polling + NotificationsPage UI |
