# B400: Dokumentasi Implementasi TA-Flowmeter

Dokumen ini mendokumentasikan implementasi sistem TA-Flowmeter menggunakan kerangka C4 Model pada tiga tingkat kedalaman yang berurutan. C1 (Diagram Konteks Sistem) melihat seluruh proyek dari luar: siapa penggunanya, perangkat apa yang terlibat, dan sistem eksternal apa yang dihubungi. C2 (Diagram Kontainer) masuk ke dalam platform software dan menunjukkan komponen-komponen yang berjalan di server. C3 (Diagram Komponen) masuk lebih dalam lagi ke dalam NestJS API dan menunjukkan modul-modul internalnya bekerja bersama. Sub-sistem backend yang didokumentasikan di bawah adalah pengelompokan domain implementasi, bukan selalu satu banding satu dengan semua NestJS module yang di-import di `AppModule` saat ini. Implementasi sub-sistem hardware (firmware ESP32-S3, rangkaian sensor, aktuator) didokumentasikan secara terpisah oleh tim elektro. Sub-Sistem 10 dan 11 mendokumentasikan dua aplikasi frontend yang dikerjakan sepenuhnya oleh tim informatika.

Catatan pembaruan terhadap kode saat ini: semua endpoint HTTP backend dipublikasikan dengan global prefix `/api`; protokol telemetri aktif adalah frame binary 25 byte dengan kompatibilitas baca untuk frame legacy 21 byte; penerimaan MQTT `device/+/data` saat ini berada di `DeviceController`, sedangkan `GatewayController` berfokus pada REST API mobile/resident dan command relay/valve berbasis unit.

---

## Traceability Verifikasi terhadap B200

Bagian ini menjadi rujukan utama untuk sidang: B200 adalah sumber kebenaran spesifikasi, sedangkan verifikasi per sub-sistem di bawah berfungsi sebagai bukti implementasi software. Spesifikasi yang berada pada ranah sensor, kalibrasi fisik, tekanan air, dan aktuasi fisik akhir dicatat sebagai tanggung jawab tim IoT/hardware; dokumen ini hanya memverifikasi sisi software, server, data transfer, dashboard, payment, dan notifikasi.

| B200 | Spesifikasi Utama | Scope Dokumen Ini | Sub-sistem Terkait | Verifikasi Software yang Dipakai | Kriteria B200 | Status |
| --- | --- | --- | --- | --- | --- | --- |
| #1 | Akurasi pengukuran listrik | Hardware/IoT | Device, Reporting | Software hanya memastikan nilai telemetry tersimpan dan dapat diagregasi tanpa delta negatif | Galat kelas 1; regresi referensi meter | Di luar scope software |
| #2 | Akurasi pengukuran air | Hardware/IoT | Device, Reporting | Software hanya memastikan nilai volume/debit tersimpan dan dapat diagregasi | Galat 5% Q1-Q2, 2% Q2-Q4; volume 0-9.999 m3 | Di luar scope software |
| #3 | Sentralisasi data air dan listrik | Software/data transfer | Gateway, Device, Dashboard | Load 2.444 client, PLR, latensi end-to-end, CPU/RAM, dashboard display | DLR < 1%, latensi <= 60 detik, CPU/RAM <= 80%, data tampil terpusat | Terverifikasi sebagian |
| #4 | Ketersediaan layanan pembayaran | Software/payment | Payment, Mobile, Admin | Probe 24/7, simulasi transaksi, webhook idempotent, update saldo token | 24/7; success rate 100% di luar jam loket pada beban normal | Terverifikasi sebagian |
| #5 | Aktuasi jarak jauh air | Software + Hardware/IoT | Device, Gateway, Admin | Software command publish, audit log, latensi perintah sampai konfirmasi status | Command MQTT QoS 1, payload <=128 byte, eksekusi <5 detik, audit trail | Terverifikasi sebagian |
| #6 | Aktuasi jarak jauh listrik | Software + Hardware/IoT | Device, Gateway, Admin | Software command publish, audit log, latensi perintah sampai konfirmasi status | Command MQTT QoS 1, payload <=128 byte, eksekusi <5 detik, audit trail | Terverifikasi sebagian |
| #7 | Integritas data operasional | Software/data | Device, Reporting, Dashboard, Mobile | Store-and-forward, status online/offline, histori konsumsi/transaksi, chart vs DB | Status biner, histori tersaji, log offline terkirim saat pulih | Terverifikasi sebagian |
| #8 | Peringatan dini gangguan | Software + Hardware/IoT | Anomaly, Notification, Telegram, Dashboard | Offline/jailbreak detection, alert dashboard/Telegram, batch offline, cooldown | Alert muncul <=90 detik sejak gangguan terdeteksi | Terverifikasi sebagian |

Catatan gap terhadap B200:

- B200 #3 menyebut MQTT v5.0, TLS 1.3, dan payload DLMS <=1 KB. Implementasi software saat ini memakai MQTT dengan frame binary 25 byte; secara ukuran payload sudah di bawah 1 KB, tetapi bukan DLMS. Jika DLMS wajib dipertahankan sebagai spesifikasi formal, perlu dicatat sebagai deviasi desain atau diselaraskan di B200.
- B200 #4 meminta success rate 100% transaksi di luar jam loket 19:01-07:59. Verifikasi saat ini sudah membuktikan endpoint/payment path tersedia, tetapi perlu satu skenario eksplisit transaksi di luar jam loket.
- B200 #5 mencakup ketahanan tekanan 1.000 kPa / 10 Bar untuk solenoid valve. Itu adalah verifikasi hardware dan tidak diuji di dokumen software ini.
- B200 #5/#6 menyebut payload command JSON <=128 byte. Implementasi command device saat ini memakai frame command ringkas/binary. Jika format JSON adalah kriteria wajib, perlu dicatat sebagai deviasi desain atau protokol command diselaraskan.
- B200 #8 menyebut notifikasi tampil di dashboard pengelola. Telegram dipakai sebagai kanal tambahan; dashboard alert tetap perlu dicatat sebagai bukti utama bila diuji.

### Checklist Verifikasi B200 Software/Data

| Checklist                                                             | B200     | Status Saat Ini                                        | Bukti di Dokumen                   |
| --------------------------------------------------------------------- | -------- | ------------------------------------------------------ | ---------------------------------- |
| Data 2.444 unit diterima server dengan PLR/DLR < 1%                   | #3       | Selesai                                                | Gateway Module                     |
| Latensi telemetry ke dashboard <= 60 detik di bawah beban 2.444 unit  | #3       | Selesai                                                | Gateway + Dashboard                |
| CPU/RAM server <= 80% saat load telemetry                             | #3       | Selesai                                                | Gateway Module                     |
| Protokol/payload diselaraskan dengan B200                             | #3/#5/#6 | Perlu keputusan deviasi                                | Catatan gap traceability           |
| Payment endpoint tersedia 24/7                                        | #4       | Selesai                                                | Payment Module                     |
| Simulasi transaksi di luar jam loket 19:01-07:59 mencapai 100% sukses | #4       | Belum dicatat eksplisit                                | Payment + Mobile                   |
| Webhook payment tervalidasi dan idempotent                            | #4       | Selesai                                                | Payment Module                     |
| Saldo token dan histori transaksi berubah setelah payment sukses      | #4/#7    | Selesai sebagian                                       | Payment + Mobile + Admin           |
| Command relay listrik < 5 detik dan tercatat audit                    | #6       | Selesai untuk jalur software                           | Device + Admin                     |
| Command valve air < 5 detik dan tercatat audit                        | #5       | Selesai untuk jalur software                           | Device + Admin                     |
| Uji tekanan solenoid valve 10 Bar                                     | #5       | Di luar scope software                                 | Tim IoT/hardware                   |
| Status online/offline tampil sebagai boolean di dashboard             | #7       | Selesai sebagian                                       | Dashboard + Anomaly                |
| Store-and-forward log offline terkirim saat pulih                     | #7       | Selesai sebagian                                       | Device Module                      |
| Grafik konsumsi dan histori pembayaran cocok dengan database          | #7       | Selesai sebagian                                       | Reporting + Dashboard              |
| Offline/jailbreak alert tampil ke pengelola <= 90 detik               | #8       | Selesai sebagian                                       | Anomaly + Notification + Dashboard |
| Tamper switch/casing alert                                            | #8       | Di luar scope software sampai sinyal hardware tersedia | Tim IoT/hardware + Anomaly         |

### Hasil Pengujian Scope Ardra (Software, 2026-06-04)

Pengujian berikut dijalankan untuk scope yang ditangani Ardra: Sub-Sistem 1 Gateway, Sub-Sistem 2 Device, Sub-Sistem 3 Auth, Sub-Sistem 4 Payment, dan Sub-Sistem 10 Dashboard. Pengujian yang menyentuh broker/load produksi tidak dijalankan otomatis tanpa jendela uji khusus agar tidak mengganggu data telemetry produksi.

| Scope | Perintah / Metode | Hasil | Interpretasi |
| --- | --- | --- | --- |
| Backend owned scope | `npm test -- --runInBand device.service.spec.ts auth.service.spec.ts payments.service.spec.ts admin.service.spec.ts admin/unit/unit.service.spec.ts` | 5 test suites passed; 34 tests passed; 0 failed | Baseline service Device, Auth, Payment, Admin command, dan Unit service lulus unit test |
| Device Module | `npm test -- --runInBand device.service.spec.ts` | 1 suite passed; 3 tests passed | Token deduction listrik/air dan relay cutoff command terverifikasi secara unit |
| Auth Module | `npm test -- --runInBand auth.service.spec.ts` | 1 suite passed; 13 tests passed | Dev login, select unit, refresh token, logout, dan endpoint `me` terverifikasi secara unit |
| Payment Module | `npm test -- --runInBand payments.service.spec.ts` | 1 suite passed; 7 tests passed | Webhook settlement, idempotency, invalid signature, expiry/cancel, dan auto-confirm terverifikasi secara unit |
| Admin command support | `npm test -- --runInBand admin.service.spec.ts` | 1 suite passed; 4 tests passed | Command/config/OTA publish via MQTT service terverifikasi secara unit |
| Unit dashboard/payment support | `npm test -- --runInBand admin/unit/unit.service.spec.ts` | 1 suite passed; 7 tests passed | Create unit, credit token, owner dashboard, dan unit notification terverifikasi secara unit |
| Backend build | `npm run build` pada `backend-ta` | Build berhasil | Backend NestJS berhasil dikompilasi |
| Dashboard build | `npm run build` pada `frontend-ta/dashboard` | Build berhasil; terdapat warning ukuran chunk dan `NODE_ENV` pada `.env` | Dashboard berhasil dikompilasi dan dibundel; warning tidak menggagalkan build |
| Dashboard lint | `npm run lint` pada `frontend-ta/dashboard` | Exit code 0; 0 error; 1 warning Fast Refresh | Tidak ada error lint; warning tidak mempengaruhi production build |
| Gateway load simulator | `node --check frontend-ta/dashboard/scripts/emqxLoadSimulator.js` | Syntax check berhasil | Script load test siap dijalankan saat broker/backend dan jendela uji tersedia |
| B200 #3 load test produksi | 2.444 MQTT client via `emqxLoadSimulator.js` | Belum dijalankan pada sesi ini | Perlu jendela uji khusus karena `.env` mengarah ke broker produksi |

---

## C1: Diagram Konteks Sistem

Diagram C1 adalah pandangan paling tinggi dari seluruh proyek TA-Flowmeter. Pada tingkat ini sistem tidak dibuka isinya; ia ditampilkan sebagai satu kotak tunggal bernama "Platform TA-Flowmeter". Yang terlihat adalah siapa yang berinteraksi dengan sistem ini dari luar: dua jenis pengguna manusia, satu jenis perangkat fisik, dan tiga layanan eksternal. Diagram ini relevan untuk kedua tim karena memperlihatkan di mana domain hardware berakhir dan domain software dimulai.

Batas antara kedua domain ini terjadi di lapisan protokol MQTT. Di sisi kiri batas itu ada perangkat fisik (PCB, sensor, aktuator, firmware) yang menjadi tanggung jawab tim elektro. Di sisi kanan batas itu ada backend, database, dan frontend yang menjadi tanggung jawab tim informatika. Keduanya hanya bertemu melalui topik MQTT: `device/{id}/data` untuk arus data sensor dari device ke server, dan `device/{id}/command` untuk arus perintah dari server ke device.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Konteks Sistem TA-Flowmeter                      │
└─────────────────────────────────────────────────────────────────────┘

Pengguna Manusia
  [Building Admin]          Pengelola gedung: memantau konsumsi, mengatur
                            unit dan device, melihat anomali, menetapkan tariff.
                            Berinteraksi via Admin Dashboard di browser.

  [Resident / Tenant]       Penghuni unit: memantau konsumsi real-time,
                            mengisi token prepaid, menerima notifikasi.
                            Berinteraksi via Mobile App di smartphone.

────────────────────── Batas Domain Hardware / Software ────────────────

Perangkat Fisik (domain tim elektro)
  [Smart Metering Device]   Satu unit ESP32-S3 per kamar apartemen.
   per unit apartemen        Subsistem listrik: sensor tegangan (resistor divider),
                            sensor arus (shunt / PZEM-004T), relay SSR, IC CS5463.
                            Subsistem air: sensor debit pulsa YF-S201, solenoid valve.
                            Firmware: dual-core FreeRTOS; Core 0 untuk sensor dan
                            keselamatan lokal, Core 1 untuk WiFi, TLS, MQTT, SD card.
                            Mengirim: frame binary 25 byte ke topik MQTT device/{id}/data
                            Menerima: frame perintah dari topik MQTT device/{id}/command

────────────────────── Batas Domain Hardware / Software ────────────────

Platform Terpusat (domain tim informatika)
  [Platform TA-Flowmeter]   Sistem terpusat yang memproses seluruh telemetri,
                            mengelola prepaid token, mendeteksi anomali, dan
                            menyajikan data ke admin dan resident.

Layanan Eksternal
  [Midtrans]                Payment gateway berlisensi Bank Indonesia.
                            Menerima: request checkout dari Platform.
                            Mengirim: webhook konfirmasi pembayaran ke Platform.

  [Google OAuth 2.0]        Identity provider untuk autentikasi pengguna.
                            Mengirim: ID token yang diverifikasi oleh Platform saat login.

  [Telegram Bot API]        Kanal notifikasi push untuk admin dan resident.
                            Menerima: pesan alert dari Platform saat anomali terdeteksi.

Hubungan Antar Elemen
  Building Admin       ──HTTPS──►  Platform TA-Flowmeter    (kelola sistem)
  Resident             ──HTTPS──►  Platform TA-Flowmeter    (pantau dan top-up)
  Smart Metering Device ─MQTT/TLS─► Platform TA-Flowmeter  (stream telemetri sensor)
  Platform TA-Flowmeter ─MQTT/TLS─► Smart Metering Device  (perintah relay dan valve)
  Platform TA-Flowmeter ──HTTPS──►  Midtrans               (buat tagihan top-up)
  Midtrans             ──HTTPS──►   Platform TA-Flowmeter   (webhook pembayaran lunas)
  Platform TA-Flowmeter ──HTTPS──►  Google OAuth 2.0       (verifikasi identitas login)
  Platform TA-Flowmeter ──HTTPS──►  Telegram Bot API       (kirim alert anomali)
```

Yang paling penting dari diagram C1 adalah posisi Smart Metering Device: ia bukan komponen pasif, melainkan sumber data primer seluruh sistem. Tanpa pembacaan sensor yang akurat dari hardware, backend tidak memiliki data untuk diproses, anomali tidak dapat dideteksi, dan saldo token tidak dapat dikurangi secara benar. Akurasi hardware yang diverifikasi tim elektro (error flowrate 3,94%, error daya 3,41%) secara langsung menentukan kebenaran semua kalkulasi di sisi software. Di sinilah kedua tim bersinggungan secara teknis: kalibrasi faktor konversi pulsa-ke-debit dan faktor koreksi daya dikonfigurasi di tabel `calibration_settings` di database, namun nilainya berasal dari pengukuran fisik yang dilakukan tim elektro.

---

## C2: Diagram Kontainer

Diagram C2 membuka kotak "Platform TA-Flowmeter" dari diagram C1 dan memperlihatkan semua program yang berjalan di dalamnya. Setiap kotak pada diagram ini adalah sebuah proses atau runtime tersendiri yang di-deploy secara mandiri. Diagram ini menjawab pertanyaan: apa saja program yang berjalan di server, dan bagaimana mereka saling terhubung?

Smart Metering Device dari diagram C1 tetap muncul di sini, tetapi sebagai sumber traffic eksternal. Ia mempublish telemetri ke EMQX Broker, yang kemudian diteruskan ke NestJS API. Pada tingkat C2 ini, NestJS API masih ditampilkan sebagai satu kotak tunggal. Isi dalamnya (modul-modul domain backend) tidak terlihat di sini; itulah yang diperlihatkan oleh diagram C3 selanjutnya.

```
Pengguna Eksternal
  [Building Admin]  ──── HTTPS ────► [Admin Dashboard  :3000  React 19 + Vite + Nginx]
  [Resident]        ──── HTTPS ────► [Mobile App       :8080  React 19 + Vite + Nginx]

Komunikasi Frontend ke Backend
  [Admin Dashboard] ── HTTPS REST/JSON ──► [NestJS API  :5000/api]
  [Mobile App]      ── HTTPS REST/JSON ──► [NestJS API  :5000/api]
  [Admin Dashboard] ── MQTT/WebSocket  ──► [EMQX Broker :8083]   (live telemetry dan ACK perangkat)
  [Mobile App]      ── MQTT/WebSocket  ──► [EMQX Broker :8083]   (live telemetri tanpa polling)

Komunikasi Device IoT
  [ESP32-S3 Device] ── MQTT/TCP QoS 1 ──► [EMQX Broker :1883]   (publish telemetri setiap 60 detik)
  [EMQX Broker]     ── MQTT subscribe ──► [NestJS API  :5000]   (backend menerima frame sensor)
  [NestJS API]      ── MQTT publish   ──► [EMQX Broker :1883]   (kirim perintah relay/valve)
  [EMQX Broker]     ── MQTT/TCP       ──► [ESP32-S3 Device]     (device eksekusi perintah)

Penyimpanan Data
  [NestJS API]      ── TypeORM/TCP/SQL ──► [MySQL 8.0]          (semua data domain)
  [NestJS API]      ── TCP (ioredis)   ──► [Redis]              (antrian BullMQ dan cache)

Integrasi Eksternal
  [NestJS API]      ── HTTPS REST      ──► [Midtrans API]       (buat tagihan pembayaran)
  [Midtrans]        ── HTTPS webhook   ──► [NestJS API :5000]   (konfirmasi pembayaran lunas)
  [NestJS API]      ── HTTPS           ──► [Google OAuth 2.0]   (verifikasi ID token login)
  [NestJS API]      ── HTTPS/Bot API   ──► [Telegram Bot API]   (kirim alert anomali)
```

Dari diagram di atas terlihat bahwa NestJS API adalah titik pusat; semua komponen lain berinteraksi dengannya. Satu-satunya komponen yang langsung bersentuhan dengan device IoT fisik adalah EMQX Broker. Frontend tidak pernah mengakses database secara langsung; semua permintaan data melewati NestJS API. Redis tidak diakses oleh frontend maupun device; ia hanya digunakan secara internal oleh NestJS untuk antrian job (BullMQ).

Susunan ini mencerminkan pola Modular Monolith: seluruh logika bisnis dikemas dalam satu unit NestJS yang di-deploy tunggal, bukan dipecah menjadi banyak microservice. Keuntungannya adalah operasional yang lebih sederhana: satu proses, satu log, satu deployment. Pemisahan tanggung jawab tetap terjaga secara internal melalui modul-modul domain seperti Auth, Device, Gateway, Payments, Reporting, Anomaly, Admin, Notification, dan Telegram, ditambah submodule administratif seperti Unit, Tariff, Audit Log, dan Retention.

---

## C3: Diagram Komponen (NestJS API)

Diagram C3 membuka kotak NestJS API dari diagram C2 dan memperlihatkan isinya: modul-modul domain NestJS yang masing-masing memiliki tanggung jawab spesifik. `AppModule` saat ini meng-import modul domain utama seperti Unit, Device, Reporting, Payments, Gateway, Anomaly, Admin, Auth, Tariff, AuditLog, Retention, dan Telegram, selain modul infrastruktur seperti Config, TypeORM, BullMQ, Schedule, dan Throttler. Modul berkomunikasi melalui pemanggilan service in-process, event internal `EventEmitter2`, BullMQ, dan MQTT publish/subscribe.

```
Batas NestJS API (satu proses, port 5000)
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  Jalur Data Real-time (device → database → anomali → notifikasi)           │
│                                                                             │
│  [EMQX] ──MQTT──► [2. Device Module] ──BullMQ/in-process──► [6. Anomaly]  │
│                          │                                    │             │
│                          └──────in-process──► [6. Anomaly Module]          │
│                                                      │                      │
│                                          [8. Notification Module]          │
│                                                      │                      │
│                                           [9. Telegram Module] ──HTTPS──►  │
│                                                                [Telegram]   │
│                                                                             │
│  Jalur Permintaan Pengguna (HTTP masuk → modul spesifik → database)        │
│                                                                             │
│  [Admin/Resident] ──HTTPS──► [3. Auth Module]    ──SQL──► [MySQL]          │
│                   ──HTTPS──► [4. Payment Module] ──SQL──► [MySQL]          │
│                              [4. Payment Module] ──HTTPS──► [Midtrans]     │
│                   ──HTTPS──► [5. Reporting Module] ──SQL──► [MySQL]        │
│                   ──HTTPS──► [7. Admin Module]   ──SQL──► [MySQL]          │
│                                 ├─ residents sub-module                     │
│                                 ├─ unit sub-module                          │
│                                 ├─ tariff sub-module                        │
│                                 ├─ audit-log sub-module                     │
│                                 └─ retention sub-module                     │
│                                                                             │
│  Event internal (satu kejadian → banyak modul mendengarkan)                │
│                                                                             │
│  [4. Payment Module] ──PaymentCompletedEvent──► [7. Admin/Unit]            │
│                                             ──► [7. Admin/AuditLog]        │
│                                             ──► [8. Notification Module]   │
│                                             ──► [1. Gateway Module]        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

Dari diagram C3 terlihat dua jalur besar yang saling terpisah. Jalur pertama adalah jalur data real-time: data sensor masuk melalui Device Module, diproses lewat antrean BullMQ bila Redis tersedia, disimpan ke database, lalu diperiksa oleh Anomaly Module yang bila perlu memicu Notification dan Telegram Module. Jalur kedua adalah jalur permintaan pengguna: admin dan resident mengirim request HTTP yang ditangani oleh modul yang sesuai. Kedua jalur bersinggungan melalui database, event internal seperti `PaymentCompletedEvent`, dan command MQTT ke device.

---

## Sub-Sistem 1: Gateway Module

### Implementasi

Gateway Module adalah lapisan REST khusus resident/mobile untuk membaca snapshot unit, tren, transaksi, invoice, notifikasi, dan mengirim perintah relay/valve berbasis nomor unit. Penerimaan MQTT telemetry dari sensor fisik (ESP32-S3) saat ini ditangani oleh Device Module melalui `DeviceController`, bukan oleh Gateway Module.

**Penerimaan Telemetri dari Device**

Setiap perangkat sensor mempublish satu paket binary berukuran 25 byte setiap interval sampling ke topik MQTT `device/{id}/data`. Paket ini dikemas dalam format big-endian dan berisi telemetry listrik, telemetry air, sisa token listrik, sisa token air, dan bit status relay/valve. `decodeTelemetry(buf: Buffer)` masih menerima frame legacy 21 byte untuk kompatibilitas, tetapi frame aktif yang dihasilkan `encodeTelemetry()` berukuran 25 byte.

Fungsi `decodeTelemetry(buf: Buffer)` di `common/binary-codec.ts` membaca buffer tersebut menggunakan `buf.readUInt32BE()` dan `buf.readUInt16BE()` pada offset yang sudah ditentukan, kemudian membagi hasilnya dengan faktor skala masing-masing field. Handler MQTT `device/+/data` berada di `device.controller.ts`; handler ini menormalkan payload menjadi `Buffer` bila memungkinkan, lalu memasukkan job ke antrean BullMQ `telemetry`.

Setelah frame diterima, backend tidak langsung menulis ke database di handler MQTT. Frame dimasukkan ke dalam antrian BullMQ berbasis Redis. Jika Redis tidak tersedia, `DeviceController` melakukan fallback inline ke `DeviceService.saveSensorData()`. Worker yang memproses antrian ini berada di Device Module (`telemetry.processor.ts`).

**REST API untuk Mobile App**

Gateway mengekspos endpoint HTTP di bawah prefix `/api/gateway/mobile/:unitNo/` untuk mobile app resident. Semua endpoint dilindungi oleh dua lapisan keamanan: (1) `JwtAuthGuard` yang memverifikasi token login, dan (2) fungsi `assertUnitAccess()` yang memastikan resident hanya bisa membaca data unit miliknya sendiri. Jika `unitNo` di URL tidak cocok dengan `unitNo` yang tersimpan di JWT token, request langsung ditolak dengan HTTP 403.

Endpoint `relay` dan `valve` mempublish frame perintah 1 byte ke topik MQTT `device/{id}/command` melalui EMQX, yang kemudian diterima dan dieksekusi oleh firmware ESP32-S3. Setiap perintah dicatat ke tabel `audit_logs`.

**Deteksi Offline Device**

Implementasi saat ini tidak memakai handler LWT `device/{id}/status` di Gateway. Status offline dihitung dari umur telemetry terakhir. `AnomalyService` menjalankan pengecekan berkala; jika tidak ada data baru melewati `offlineThresholdMs` (10 menit), sistem membuat anomali `device_offline` dan dapat mengirim notifikasi batch ke admin.

**Notifikasi Mobile (Topup Success)**

Endpoint `GET /gateway/mobile/:unitNo/notifications` mengembalikan gabungan dua sumber: daftar anomali aktif dari Anomaly Module dan daftar transaksi berhasil dari Payment Module yang disintesis menjadi notifikasi bertipe `topup_success`. Penggabungan ini dilakukan di `GatewayService.getMobileAnomalies()` dan diurutkan berdasarkan waktu terbaru.

**Fungsi Utama**

- `handleSensorData(data: Buffer)` di Device Module: handler utama MQTT binary; normalisasi frame, push ke BullMQ, fallback inline jika Redis tidak tersedia.
- `checkOfflineDevices()` di Anomaly Module: cek device yang telemetry terakhirnya melewati threshold offline.
- `getMobileDashboard(unitNo)`: kumpulkan snapshot unit + readings + anomaly.
- `getMobileTrends(unitNo, period)`: delegasikan ke Reporting Module.
- `getMobileAnomalies(unitNo)`: gabungkan anomali aktif dan notifikasi topup_success.
- `setRelayByUnitNo(unitNo, status, actor)`: publish command MQTT + tulis audit log.
- `setValveByUnitNo(unitNo, status, actor)`: sama untuk katup air.

### Antarmuka Data

**Format Frame Telemetri MQTT (25 byte, big-endian)**

| Offset     | Ukuran             | Field             | Satuan  | Formula Dekode              | Contoh                       |
| ---------- | ------------------ | ----------------- | ------- | --------------------------- | ---------------------------- |
| Byte 0–3   | 4 byte (uint32 BE) | energy_total      | kWh     | buf.readUInt32BE(0) / 100   | 0x0000C350 → 1.250,00 kWh    |
| Byte 4–5   | 2 byte (uint16 BE) | power             | W       | buf.readUInt16BE(4) / 10    | 0x09C4 → 250,0 W             |
| Byte 6–7   | 2 byte (uint16 BE) | voltage           | V       | buf.readUInt16BE(6) / 10    | 0x0884 → 218,0 V             |
| Byte 8–9   | 2 byte (uint16 BE) | current           | A       | buf.readUInt16BE(8) / 1000  | 0x044C → 1,100 A             |
| Byte 10–11 | 2 byte (uint16 BE) | water_flow        | L/menit | buf.readUInt16BE(10) / 100  | 0x012C → 3,00 L/menit        |
| Byte 12–15 | 4 byte (uint32 BE) | water_total       | m³      | buf.readUInt32BE(12) / 1000 | 0x00046A1 → 18,081 m³        |
| Byte 16–19 | 4 byte (uint32 BE) | token_electricity | kWh     | buf.readUInt32BE(16) / 1000 | 0x00007530 → 30,000 kWh      |
| Byte 20–23 | 4 byte (uint32 BE) | token_water       | m³      | buf.readUInt32BE(20) / 1000 | 0x00002710 → 10,000 m³       |
| Byte 24    | 1 byte (bitmask)   | flags             | bitmask | bit0 = relay, bit1 = valve  | 0x03 → relay ON + valve OPEN |

Keterangan bitmask flags:

| Bit   | Field        | Nilai 0                       | Nilai 1                      |
| ----- | ------------ | ----------------------------- | ---------------------------- |
| bit 0 | relay_status | Relay OFF (listrik diputus)   | Relay ON (listrik terhubung) |
| bit 1 | valve_status | Valve CLOSED (katup tertutup) | Valve OPEN (katup terbuka)   |

Total ukuran frame aktif: 25 byte. Format big-endian (byte paling signifikan di offset terkecil). Decoder masih menerima frame legacy 21 byte dengan token default 0 dan flags pada offset 20, tetapi firmware dan simulator saat ini menghasilkan frame 25 byte.

**Format Frame Perintah MQTT (1 byte)**

Frame perintah dikirim dari backend ke topik `device/{id}/command`. Satu byte dikodekan sebagai dua nibble:

| Nibble                  | Posisi        | Makna                          |
| ----------------------- | ------------- | ------------------------------ |
| Nibble atas (bits 7–4)  | Tipe aktuator | 0x1 = relay, 0x2 = valve       |
| Nibble bawah (bits 3–0) | Nilai         | 0x0 = OFF/tutup, 0x1 = ON/buka |

Kombinasi perintah yang valid:

| Perintah    | Hex  | Aksi                  |
| ----------- | ---- | --------------------- |
| Relay ON    | 0x11 | Hidupkan listrik unit |
| Relay OFF   | 0x10 | Matikan listrik unit  |
| Valve OPEN  | 0x21 | Buka katup air        |
| Valve CLOSE | 0x20 | Tutup katup air       |

**Respons GET /gateway/mobile/:unitNo/dashboard**

```json
{
  "unitNo": "A-101",
  "summary": {
    "id": 1,
    "unitNo": "A-101",
    "tokenElectricity": 28.5,
    "tokenWater": 9.2,
    "energyTariff": 1500,
    "waterTariff": 5000,
    "relayStatus": true,
    "valveStatus": true,
    "remainingEstimate": {
      "kwh": 28.5,
      "hours": 81
    },
    "connectivity": {
      "online": true,
      "lastTelemetryAt": "2026-05-24T14:30:00.000Z"
    }
  }
}
```

**Respons GET /gateway/mobile/:unitNo/notifications** (array AnomalyItem)

```json
[
  {
    "anomalyType": "low_electricity_token",
    "severity": "warning",
    "message": "Saldo token listrik hampir habis: 3.2 kWh tersisa",
    "metadata": { "remainingKwh": 3.2 },
    "detectedAt": "2026-05-24T07:15:00.000Z"
  },
  {
    "anomalyType": "topup_success",
    "severity": "info",
    "message": "Pembelian token sebesar Rp150.000 berhasil masuk ke saldo Anda.",
    "metadata": { "amount": 150000, "tx_id": "TRX-1716523200-123" },
    "detectedAt": "2026-05-24T14:35:22.000Z"
  }
]
```

**Request/Respons POST /gateway/mobile/:unitNo/relay**

```json
// Request body
{ "status": true }

// Response body
{ "relayStatus": true }
```

**Request/Respons POST /gateway/mobile/:unitNo/valve**

```json
// Request body
{ "status": false }

// Response body
{ "valveStatus": false }
```

### Antarmuka Pengguna

- Dashboard Resident (mobile): Halaman utama yang menampilkan snapshot dari `GET /gateway/mobile/:unitNo/dashboard`. Data yang ditampilkan meliputi saldo token, tegangan, arus, aliran air, dan status relay serta katup.
- Halaman Tren Konsumsi (mobile): Grafik harian dan bulanan dari `GET /gateway/mobile/:unitNo/trends`.
- Tombol Kontrol Relay dan Katup (mobile): Komponen yang mengirim `POST /gateway/mobile/:unitNo/relay` dan valve.
- Notifikasi Anomali (mobile): Daftar dari `GET /gateway/mobile/:unitNo/notifications`.
- Tower Connectivity Panel (dashboard admin): Widget yang menampilkan jumlah unit online/offline dari `GET /gateway/tower/connectivity`.

### Verifikasi

| Aspek yang Diverifikasi         | Metode Pengujian                                                                                                      | Hasil Terukur                          | Batas Spesifikasi / B200                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| Kapasitas data masuk 2.444 unit | 2.444 proses MQTT client independen mempublish 1 frame/menit selama 30 menit; PLR = (1 - N_diterima/N_dikirim) x 100% | PLR = 0,43% (N_dikirim = 73.320 frame) | B200 #3: DLR/PLR < 1%                                       |
| Latensi end-to-end ke dashboard | Diukur dari timestamp publish MQTT hingga data muncul di dashboard; 10 percobaan di bawah beban 2.444 client          | Maksimum 15 detik                      | B200 #3: <= 60 detik                                        |
| Beban server saat sentralisasi  | CPU dan RAM dimonitor saat 2.444 client aktif                                                                         | CPU 53% peak, RAM 59% peak             | B200 #3: CPU/RAM <= 80%                                     |
| Isolasi akses data resident     | Coba akses data unit lain menggunakan JWT unit yang valid                                                             | Response HTTP 403 Forbidden            | Pendukung B200 #7: data operasional hanya untuk unit berhak |

### Kemungkinan Peningkatan

- **Replay historis dengan timestamp asli:** Saat device kembali online setelah putus, firmware mempublish ulang frame-frame yang tersimpan di SD card. Backend saat ini menerima frame tersebut dengan timestamp server, bukan timestamp asli pengukuran. Keputusan apakah historis offline perlu diterima dengan timestamp asli adalah keputusan bisnis: jika akurasi rekam jejak konsumsi selama offline lebih penting daripada kesederhanaan implementasi, protokol replay perlu ditambahkan secara eksplisit, baik melalui frame MQTT yang membawa timestamp asli maupun endpoint admin/backend khusus.
- **Rate limiting per-unit:** Endpoint gateway belum memiliki rate limiting per-unit. Penambahan `@Throttle()` adalah keputusan operator tentang seberapa sering resident diizinkan melakukan polling; nilai threshold yang tepat bergantung pada kebutuhan UX yang ditentukan pengelola gedung.

---

## Sub-Sistem 2: Device Module

### Implementasi

Device Module bertanggung jawab atas dua hal: menyimpan setiap pembacaan sensor ke database secara andal, dan mengirimkan perintah aktuator ke device fisik atas permintaan admin atau resident.

**Persistensi Telemetri**

Frame dari topik MQTT `device/+/data` diterima langsung oleh `DeviceController`, lalu dimasukkan ke antrian BullMQ dengan nama `'telemetry'`. Worker `telemetry.processor.ts` mengambil setiap job dan menjalankan langkah-langkah berikut:

1. Validasi frame: pastikan `device_id` terdaftar di tabel `units`.
2. Tulis baris baru ke tabel `meter_readings`. Query reporting dan dashboard membatasi rentang waktu agar pembacaan tetap efisien; skema produksi saat ini tidak boleh diasumsikan memakai penghapusan partisi otomatis.
3. Hitung delta konsumsi: selisih antara `energy_total` saat ini dan `last_energy_reading` di tabel `units`. Jika nilai turun (sensor reset karena penggantian hardware), baseline diperbarui dan delta dianggap nol sehingga unit tidak dikenai biaya ganda.
4. Panggil `AnomalyService.checkOnTelemetry()` untuk pengecekan anomali real-time.

**Penanganan Sensor Reset**

Jika nilai `energy_total` atau `water_total` yang datang lebih kecil dari nilai yang tersimpan di `last_energy_reading` atau `last_water_reading`, sistem menyimpulkan bahwa sensor telah di-reset (penggantian hardware atau power cycle yang tidak wajar). Dalam kondisi ini, baseline diperbarui ke nilai baru dan delta untuk interval tersebut dianggap nol. Log peringatan ditulis untuk keperluan audit.

**Perintah Aktuator**

Admin dapat mematikan relay atau menutup katup dari dashboard. Service memanggil fungsi yang mempublish frame perintah 1 byte ke topik `device/{id}/command` sesuai format binary-codec, lalu menyimpan catatan ke tabel `audit_logs`.

**Fungsi Utama**

- `process(job)` di `telemetry.processor.ts`: worker BullMQ; validasi, simpan reading, kurangi token, trigger anomaly check.
- `persistReading(frame)`: INSERT ke `meter_readings` via TypeORM.
- `setRelay(deviceId, status, actor)`: publish frame 0x11/0x10 ke MQTT dan tulis audit log.
- `setValve(deviceId, status, actor)`: publish frame 0x21/0x20 ke MQTT dan tulis audit log.
- `findAll()`: list semua device beserta last reading.
- `getLatestReadings(deviceId, limit)`: SELECT ORDER BY time DESC LIMIT N untuk sparkline.

### Antarmuka Data

**Format Frame Kalibrasi MQTT (4 byte, topik `device/{id}/calibration`)**

| Offset   | Ukuran             | Field                | Satuan        | Formula Enkode             |
| -------- | ------------------ | -------------------- | ------------- | -------------------------- |
| Byte 0–1 | 2 byte (uint16 BE) | CAL_FACTOR_FLOWRATE  | tanpa dimensi | nilai × 100, range 0–500   |
| Byte 2   | 1 byte (uint8)     | CAL_FACTOR_POWER     | tanpa dimensi | nilai × 100, range 0–200   |
| Byte 3   | 1 byte (uint8)     | SENSOR_SAMPLING_TIME | detik         | nilai langsung, range 1–10 |

**Format Frame Topup MQTT (12 byte, topik `device/{id}/topup`)**

Frame ini dikirim ke device setelah pembayaran berhasil dikonfirmasi, sehingga device dapat mengupdate saldo token secara lokal dan membuka relay/valve yang sebelumnya terkunci.

| Offset    | Ukuran             | Field              | Satuan | Formula Enkode          |
| --------- | ------------------ | ------------------ | ------ | ----------------------- |
| Byte 0–3  | 4 byte (uint32 BE) | electricity_amount | Rupiah | nilai bulat (tanpa sen) |
| Byte 4–7  | 4 byte (uint32 BE) | water_amount       | Rupiah | nilai bulat             |
| Byte 8–11 | 4 byte (uint32 BE) | timestamp          | detik  | Unix epoch (seconds)    |

**Format Frame OTA MQTT (variable, topik `device/{id}/ota`)**

| Offset   | Ukuran           | Field       | Keterangan                         |
| -------- | ---------------- | ----------- | ---------------------------------- |
| Byte 0   | 1 byte (uint8)   | major       | Versi major firmware               |
| Byte 1   | 1 byte (uint8)   | minor       | Versi minor firmware               |
| Byte 2   | 1 byte (uint8)   | patch       | Versi patch firmware               |
| Byte 3   | 1 byte (bitmask) | flags       | 0x01 = update_now, 0x02 = force    |
| Byte 4–N | variable (UTF-8) | binary_link | URL file .bin sebagai string UTF-8 |

**Schema Tabel meter_readings (field utama)**

| Kolom        | Tipe           | Keterangan                                             |
| ------------ | -------------- | ------------------------------------------------------ |
| time         | DATETIME (UTC) | Timestamp pembacaan; bagian dari primary key composite |
| device_id    | VARCHAR        | ID device ESP32; bagian dari primary key composite     |
| energy_total | DECIMAL        | kWh kumulatif sejak pertama dinyalakan                 |
| power        | DECIMAL        | Daya aktif sesaat (W)                                  |
| voltage      | DECIMAL        | Tegangan sesaat (V)                                    |
| current      | DECIMAL        | Arus sesaat (A)                                        |
| water_flow   | DECIMAL        | Laju aliran sesaat (L/menit)                           |
| water_total  | DECIMAL        | Volume air kumulatif (m³)                              |

Retensi data lama saat ini dilakukan oleh `RetentionService.handleRetention()` dengan query `DELETE` TypeORM untuk `meter_readings` lebih lama dari 24 bulan dan `transactions` lebih lama dari 60 bulan. Dokumen ini tidak lagi mengasumsikan mekanisme `ALTER TABLE DROP PARTITION`.

### Antarmuka Pengguna

- Halaman Perangkat (dashboard admin): `DevicesPage.tsx` menampilkan semua device beserta device_id, unit yang dipasang, status online, dan pembacaan terakhir.
- Detail Unit (dashboard admin): `UnitDetailPage.tsx` menampilkan telemetry live via MQTT `device/{id}/data` dan tren historis dari `GET /reporting/trends/:unitNo`.
- Control Center (dashboard admin): `ControlCenterPage.tsx` untuk perintah relay dan valve ke beberapa unit.
- Status Bar (mobile): indikator relay ON/OFF dan valve OPEN/CLOSED dari snapshot gateway.

### Verifikasi

| Aspek yang Diverifikasi        | Metode Pengujian                                                                                                           | Hasil Terukur                                                                | Batas Spesifikasi / B200                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Store-and-forward saat offline | Putuskan device selama 5, 15, dan 30 menit; replay frame dari SD card setelah reconnect; hitung N_diterima vs N_seharusnya | N_diterima = N_seharusnya untuk ketiga skenario (0 frame hilang)             | B200 #7: log offline terkirim saat pulih                                        |
| Latensi aktuasi relay listrik  | 6 percobaan ON/OFF bergantian; ukur dari submit perintah hingga konfirmasi status                                          | Latensi maksimum 2,21 detik                                                  | B200 #6: < 5 detik                                                              |
| Latensi aktuasi katup air      | 6 percobaan open/close bergantian; ukur dari submit perintah hingga konfirmasi status                                      | Latensi maksimum 2,37 detik                                                  | B200 #5: < 5 detik untuk jalur command software; uji tekanan fisik oleh tim IoT |
| Audit trail perintah aktuator  | Periksa tabel `audit_logs` setelah setiap perintah relay dan valve                                                         | Setiap perintah menghasilkan baris dengan aktor, jenis, device_id, dan hasil | B200 #5/#6: setiap eksekusi dicatat                                             |

### Kemungkinan Peningkatan

- **Device reassignment:** Jika sebuah device dipindahkan ke unit lain (penggantian hardware), semua `meter_readings` historis tetap terikat ke `device_id` lama. Apakah historis perlu di-relabel adalah keputusan pengelola gedung: jika continuous billing history per-unit lebih penting daripada per-device, endpoint admin untuk re-map `device_id` pada readings historis perlu ditambahkan.

---

## Sub-Sistem 3: Auth Module

### Implementasi

Auth Module menangani autentikasi seluruh pengguna menggunakan Google OAuth 2.0 sebagai identity provider, dan menerbitkan JSON Web Token (JWT) sebagai bukti identitas untuk request-request berikutnya.

**Alur Login Google OAuth 2.0**

Resident atau admin tidak membuat password di sistem ini. Mereka login melalui tombol "Sign in with Google". Prosesnya:

1. Aplikasi frontend meminta Google ID Token dari Google Sign-In SDK.
2. Token ini dikirimkan ke backend melalui `POST /auth/google` (resident) atau melalui admin endpoint.
3. Backend memanggil `googleClient.verifyIdToken()` dari `google-auth-library`, yang secara internal mengambil kunci publik Google (JWKS) dan memverifikasi signature ID token secara kriptografis, termasuk pengecekan `aud` dan `exp`.
4. Jika valid, backend mencari record resident di tabel `residents`. Jika email tidak terdaftar, request ditolak dengan HTTP 401. Google ID token yang valid dari akun yang tidak terdaftar tetap tidak dapat masuk ke sistem.
5. Backend menerbitkan pasangan token menggunakan `issueTokenPair()`.

**Token yang Diterbitkan**

Access Token: JWT yang ditandatangani dengan algoritma HS256 menggunakan `JWT_SECRET`. Masa berlaku default 3.600 detik (1 jam), dapat dikonfigurasi via `JWT_EXPIRES_IN_SECONDS`. Payload berisi: `sub` (email), `role` ('admin' atau 'resident'), `unitId`, `unitNo`, `name`, `iat`, `exp`.

Refresh Token: String 48 byte acak dari `randomBytes(48).toString('base64url')`. Nilai ini diberikan kepada klien. Sebelum disimpan ke tabel `auth_refresh_tokens`, nilai tersebut di-hash dengan SHA-256 (`createHash('sha256').update(token).digest('hex')`). Kolom `token_hash` menyimpan hash, bukan token aslinya, sehingga jika database bocor attacker tidak dapat langsung menggunakan token tersebut. Masa berlaku default 604.800 detik (7 hari), dapat dikonfigurasi via `JWT_REFRESH_EXPIRES_IN_SECONDS`.

**Token Rotation saat Refresh**

Ketika klien mengirim refresh token ke `POST /auth/refresh`, backend mencari hash-nya di database, memverifikasi bahwa token belum kadaluarsa dan belum direvoke, lalu **langsung menandai token lama sebagai revoked** sebelum menerbitkan pasangan token baru. Ini adalah token rotation: setiap refresh menghasilkan pasangan token baru, dan token lama tidak dapat digunakan lagi.

**Pemilihan Unit oleh Resident**

Setelah login, resident memanggil `POST /auth/select-unit` untuk memilih unitnya. Backend memverifikasi bahwa unit tersebut terdaftar atas nama email resident, lalu menerbitkan JWT baru dengan claim `unitNo` terisi. Setelah ini, semua endpoint yang menggunakan `assertUnitAccess()` akan membandingkan `unitNo` dari JWT dengan unit yang diminta.

**Guard Hierarchy**

- `JwtAuthGuard`: memverifikasi signature dan kadaluarsa JWT; digunakan di endpoint yang bisa diakses oleh admin maupun resident.
- `AdminJwtGuard`: sama seperti JwtAuthGuard, ditambah pengecekan bahwa `payload.role === 'admin'`; digunakan di semua endpoint manajemen.

**Dev Login**

Endpoint `POST /auth/dev-login` aktif hanya saat `NODE_ENV !== 'production'`. Pada server produksi, endpoint ini mengembalikan HTTP 401 karena condition check dilakukan di dalam fungsi service-nya.

**Fungsi Utama**

- `googleLogin(credential)`: verify Google token, lookup resident, issueTokenPair.
- `adminGoogleLogin(credential)`: verify Google token, cek role === 'admin', issueTokenPair.
- `issueTokenPair(payload)`: sign access token HS256, generate refresh token, simpan hash ke DB.
- `refresh(refreshToken)`: lookup hash, revoke lama, issueTokenPair baru.
- `logout(user, refreshToken?)`: revoke token spesifik atau semua token aktif milik user.
- `selectUnit(user, unitId)`: verifikasi ownership unit, issueTokenPair dengan unitNo.
- `hashRefreshToken(token)`: SHA-256 hex dari token mentah.

### Antarmuka Data

**Payload JWT (setelah decode)**

```json
{
  "sub": "budi@example.com",
  "role": "resident",
  "unitId": 1,
  "unitNo": "A-101",
  "name": "Budi Santoso",
  "iat": 1716523200,
  "exp": 1716526800
}
```

**Request/Respons POST /auth/google**

```json
// Request
{ "credential": "eyJhbGciOiJSUzI1NiIs..." }

// Response
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "h8K_mNABC...64-char-base64url-string",
  "tokenType": "Bearer",
  "unitNo": "A-101",
  "expiresIn": "3600s",
  "refreshExpiresIn": "604800s",
  "name": "Budi Santoso",
  "units": [{ "id": 1, "unitNo": "A-101" }]
}
```

**Request/Respons POST /auth/select-unit**

```json
// Request
{ "unitId": 1 }

// Response (sama dengan struktur di atas, tetapi unitNo sudah terisi di JWT)
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "h8K_mN...",
  "tokenType": "Bearer",
  "unitNo": "A-101",
  "expiresIn": "3600s",
  "refreshExpiresIn": "604800s",
  "name": "Budi Santoso",
  "units": [{ "id": 1, "unitNo": "A-101" }]
}
```

**Request POST /auth/refresh**

```json
{ "refreshToken": "h8K_mN...64-char-base64url-string" }
```

### Antarmuka Pengguna

- Halaman Login Admin (dashboard): `LoginPage.tsx` menampilkan tombol Google Sign-In. Setelah berhasil, access token disimpan di `localStorage` dengan key `admin-token`.
- Halaman Login Resident (mobile): Google Sign-In dilanjutkan layar pemilihan unit yang memanggil `POST /auth/select-unit`. Token disimpan di `localStorage` dengan key `mobile_access_token` dan `mobile_refresh_token`.
- Halaman Manajemen User (dashboard admin): `UsersPage.tsx` menampilkan daftar resident beserta role-nya.
- Account Sheet (mobile): menampilkan nama, email dari JWT payload. Tombol logout memanggil `POST /auth/logout`.

### Verifikasi

| Aspek yang Diverifikasi                                   | Metode Pengujian                                                | Hasil Terukur                                | Batas Spesifikasi / Relevansi                                              |
| --------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| Google ID token yang dimanipulasi ditolak                 | Kirim token dengan signature yang diubah ke `POST /auth/google` | Response HTTP 401 Unauthorized               | Pendukung keamanan akses dashboard/mobile                                  |
| Resident dengan role `resident` ditolak di endpoint admin | Login sebagai resident, coba endpoint admin                     | Response HTTP 403 Forbidden                  | Pendukung B200 #7: data operasional pengelola tidak terbuka untuk resident |
| Revokasi sesi berfungsi setelah logout                    | Login, catat refresh token, logout, coba gunakan refresh token  | Response HTTP 401; `revoked_at` terisi di DB | Pendukung keamanan layanan 24/7                                            |

### Kemungkinan Peningkatan

- **Durasi token yang dapat dikonfigurasi per-role:** Saat ini satu nilai `JWT_EXPIRES_IN_SECONDS` berlaku untuk semua role. Jika pengelola gedung menginginkan sesi admin yang lebih pendek dari sesi resident karena alasan kepatuhan internal, konfigurasi per-role dapat ditambahkan sebagai variabel environment terpisah.

---

## Sub-Sistem 4: Payment Module

### Implementasi

Payment Module menangani seluruh siklus pembayaran top-up token: dari pembuatan tagihan Midtrans, penerimaan konfirmasi pembayaran, hingga pengisian saldo token di unit resident.

**Inisiasi Pembayaran**

Resident memilih nominal top-up untuk listrik dan air, lalu mengirim `POST /gateway/mobile/:unitNo/topup/initiate` ke backend. Service membuat record `Transaction` di database dengan status `'pending'`, memanggil Midtrans CoreApi untuk membuat transaksi, dan menambahkan job ke antrian BullMQ dengan delay 30 menit untuk auto-expiry.

Metode pembayaran yang didukung: `'qris'` (GoPay/QRIS via CoreApi gopay), `'transfer'` (bank transfer BCA), `'ewallet'`. Untuk transfer bank, Midtrans mengembalikan virtual account number. Untuk QRIS, Midtrans mengembalikan URL QR code.

**Penerimaan Webhook Pembayaran**

Ketika resident berhasil membayar, Midtrans mengirimkan `POST /payments/webhook/callback`. Backend melakukan dua validasi sebelum memproses:

1. IP allowlist: hanya request dari IP resmi Midtrans yang diterima (dikonfigurasi via `PAYMENT_WEBHOOK_ALLOWED_IPS`). Jika variabel ini kosong, validasi IP dilewati dan log peringatan ditulis.
2. Signature verification: SHA-512 dari `order_id + status_code + gross_amount + server_key` harus cocok dengan field `signature_key` dari Midtrans. Request dengan signature tidak valid langsung ditolak HTTP 401.

Setelah validasi berhasil, backend memperbarui status transaksi ke `'success'`, mengisi `confirmed_at`, menyimpan ke database, lalu menerbitkan `PaymentCompletedEvent`. Urutan ini (save dahulu, emit kemudian) memastikan tidak ada token yang dikreditkan untuk transaksi yang belum tersimpan.

**Idempotency Webhook**

Idempotency diimplementasikan menggunakan kolom `webhook_event_id` di tabel `transactions`. Key idempotency dibentuk sebagai `transaction_id + '-' + transaction_status`. Jika webhook dengan key yang sama sudah diproses sebelumnya, backend mengembalikan respons idempotent tanpa memproses ulang.

**Konversi Rupiah ke Token**

Konversi dari Rupiah ke kWh dan m³ menggunakan tarif aktif dari tabel `tariffs` (baris dengan `effective_date` terbaru yang tidak melebihi hari ini). Konversi terjadi di listener `PaymentCompletedEvent` di sisi Admin Module saat `creditToken()` dipanggil.

**Fungsi Utama**

- `initiateTopup(dto)`: buat record 'pending', panggil Midtrans CoreApi, enqueue expiry job.
- `handleWebhook(dto)`: validasi signature + idempotency, update status, emit PaymentCompletedEvent.
- `getTopupStatus(unitNo, txId)`: poll Midtrans untuk status terkini jika masih pending.
- `buildInvoiceForUnit(unitNo, txId)`: buat teks invoice plain-text.
- `process(job)` di `payment-expiry.processor.ts`: ubah transaksi pending melewati 30 menit menjadi 'failed'.

### Antarmuka Data

**Request POST /gateway/mobile/:unitNo/topup/initiate**

```json
{
  "electricityAmount": 100000,
  "waterAmount": 50000,
  "method": "qris"
}
```

**Respons POST /gateway/mobile/:unitNo/topup/initiate**

```json
{
  "transactionId": "TRX-1716523200-123",
  "gatewayReference": "midtrans-internal-id",
  "vaNumber": null,
  "qrUrl": "https://api.midtrans.com/v2/.../qr-code",
  "status": "pending",
  "expiresAt": "2026-05-24T15:00:00.000Z"
}
```

**Respons GET /gateway/mobile/:unitNo/topup/status/:transactionId**

```json
{
  "status": "success",
  "confirmedAt": "2026-05-24T14:35:22.000Z"
}
```

**Format Invoice Plain Text (output dari buildInvoiceForUnit)**

```
INVOICE TOKEN TOP-UP
Transaction ID: TRX-1716523200-123
Gateway Ref:    midtrans-internal-id
Unit:           A-101
Total:          Rp 150.000
Method:         qris
Status:         success
Created:        2026-05-24T14:30:00.000Z
Confirmed:      2026-05-24T14:35:22.000Z
```

Invoice ini dikirimkan ke klien sebagai respons HTTP dengan Content-Type `text/plain; charset=utf-8` melalui `GET /gateway/mobile/:unitNo/invoice/:transactionId`.

**Respons GET /gateway/mobile/:unitNo/transactions** (array TransactionResponse)

```json
[
  {
    "id": "TRX-1716523200-123",
    "unitNo": "A-101",
    "amount": 150000,
    "electricityAmountRp": 100000,
    "waterAmountRp": 50000,
    "method": "qris",
    "status": "success",
    "gatewayReference": "midtrans-internal-id",
    "createdAt": "2026-05-24T14:30:00.000Z",
    "confirmedAt": "2026-05-24T14:35:22.000Z"
  }
]
```

**PaymentCompletedEvent (in-process, EventEmitter2)**

```
event name : 'payment.completed'
payload    : {
  transactionId      : string      // ID transaksi
  unitNo             : string      // unit yang menerima kredit
  electricityAmountRp: number      // nominal listrik (Rp)
  waterAmountRp      : number      // nominal air (Rp)
  method             : string      // 'qris' | 'transfer' | 'ewallet'
  confirmedAt        : Date        // waktu konfirmasi
}
```

Event ini didengarkan oleh 4 listener: unit (credit token), audit-log (catat), notification (konfirmasi ke resident), gateway (re-enable relay jika token sebelumnya nol).

**Midtrans Webhook Request (diterima dari Midtrans)**

```json
{
  "transaction_id": "midtrans-internal-id",
  "order_id": "TRX-1716523200-123",
  "transaction_status": "settlement",
  "fraud_status": "accept",
  "payment_type": "gopay",
  "gross_amount": "150000.00",
  "status_code": "200",
  "signature_key": "sha512hex..."
}
```

### Antarmuka Pengguna

- Form Top-up (mobile): input nominal listrik dan air, dropdown metode, tombol "Beli Token" yang memanggil `POST /gateway/mobile/:unitNo/topup/initiate`.
- Status Pembayaran (mobile): polling `GET /gateway/mobile/:unitNo/topup/status/:id` untuk menampilkan progres pembayaran.
- Riwayat Transaksi (mobile): daftar top-up dengan badge status pending/success/failed.
- Invoice Download (mobile): link unduhan dari `GET /gateway/mobile/:unitNo/invoice/:transactionId`.
- Halaman Transaksi (dashboard admin): `TransactionsPage.tsx` menampilkan semua transaksi dengan filter.

### Verifikasi

| Aspek yang Diverifikasi                       | Metode Pengujian                                                               | Hasil Terukur                                                     | Batas Spesifikasi / B200                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Ketersediaan layanan pembayaran               | Probe HTTP ke `/health/check` setiap 5 menit selama 7 hari; total 2.016 probe  | 100% probe mengembalikan HTTP 2xx                                 | B200 #4: layanan 24/7                                       |
| Success rate transaksi di luar jam loket      | Simulasi N transaksi pada rentang 19:01-07:59 dan hitung Tsuccess/N x 100%     | Belum dicatat eksplisit di dokumen ini                            | B200 #4: 100% pada beban normal                             |
| Webhook pembayaran idempotent dan tervalidasi | Kirim webhook identik dua kali dan kirim webhook dengan signature dimanipulasi | Duplikat tidak memproses ulang; signature salah ditolak HTTP 401  | B200 #4: callback asinkron tervalidasi                      |
| Saldo token terupdate setelah pembayaran      | Ukur waktu dari pembayaran berhasil hingga saldo di dashboard mobile berubah   | Balance terupdate dalam 1 interval publish (kurang dari 60 detik) | B200 #4/#7: transaksi tercatat dan data operasional berubah |

### Kemungkinan Peningkatan

- **Refund:** Sistem prepaid ini tidak mendukung refund secara teknis. Kebijakan pengembalian dana adalah keputusan bisnis pengelola gedung; jika refund diperlukan, mekanisme perlu disepakati antara pengelola dan payment gateway sebelum implementasi teknis dapat dilakukan.
- **Metode pembayaran tambahan:** Midtrans mendukung banyak metode selain yang diimplementasikan saat ini. Penambahan metode (misalnya OVO, Dana, kartu kredit) adalah keputusan bisnis yang bergantung pada kesepakatan merchant dengan Midtrans.

---

## Sub-Sistem 5: Reporting Module

### Implementasi

Reporting Module menyediakan data agregat konsumsi untuk grafik di dashboard admin dan mobile app resident. Modul ini bersifat read-only dan hanya diakses oleh admin melalui `GET /reporting/trends/:unitNo` (dilindungi `AdminJwtGuard`). Resident mengakses data trend melalui gateway: `GET /gateway/mobile/:unitNo/trends`.

**Cara Kerja Agregasi dengan Window Function LAG()**

Setiap baris di tabel `meter_readings` menyimpan nilai kumulatif (`energy_total` dan `water_total`). Untuk mendapatkan konsumsi per bucket waktu, perlu dihitung selisih antar baris yang berurutan. Modul ini menggunakan SQL window function `LAG()` untuk mengambil nilai dari baris sebelumnya secara efisien:

```sql
SELECT
  sub.bucket                              AS bucket,
  SUM(GREATEST(0, sub.energy_delta))      AS kwh,
  SUM(GREATEST(0, sub.water_delta))       AS water_m3,
  AVG(sub.power)                          AS avg_power,
  AVG(sub.water_flow)                     AS avg_flow,
  COUNT(*)                                AS cnt
FROM (
  SELECT
    DATE(time)                                                  AS bucket,
    COALESCE(energy_total, 0)
      - LAG(COALESCE(energy_total, 0), 1, COALESCE(energy_total, 0))
        OVER (ORDER BY time)                                    AS energy_delta,
    COALESCE(water_total, 0)
      - LAG(COALESCE(water_total, 0), 1, COALESCE(water_total, 0))
        OVER (ORDER BY time)                                    AS water_delta,
    power,
    water_flow
  FROM meter_readings
  WHERE device_id = ?
    AND time >= DATE_SUB(NOW(), INTERVAL 31 DAY)
) sub
WHERE sub.time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY sub.bucket
ORDER BY sub.bucket ASC
LIMIT 30
```

Pendekatan LAG() ini aman terhadap sensor reset: jika nilai kumulatif turun (karena penggantian sensor), delta menjadi negatif, dan `GREATEST(0, delta)` menjadikannya nol sehingga tidak ada konsumsi negatif yang muncul di grafik. Inner query mengambil 31 hari agar baris paling awal memiliki nilai LAG yang valid (bukan nol).

Untuk mode bulanan, inner query mengambil 13 bulan, dan bucket menggunakan `DATE_FORMAT(time, '%Y-%m')`.

**Fungsi Utama**

- `getConsumptionTrends(unitNo, period)`: cari device_id berdasarkan unitNo, jalankan query LAG(), kembalikan array TrendPoint.

### Antarmuka Data

**Respons GET /reporting/trends/:unitNo?period=daily** (array TrendPoint)

```json
[
  {
    "bucket": "2026-05-23",
    "kwh": 7.2,
    "waterM3": 0.38,
    "avgPowerW": 300.0,
    "avgFlowLpm": 1.9
  },
  {
    "bucket": "2026-05-24",
    "kwh": 8.5,
    "waterM3": 0.45,
    "avgPowerW": 354.2,
    "avgFlowLpm": 2.3
  }
]
```

**Respons GET /reporting/trends/:unitNo?period=monthly** (bucket format YYYY-MM)

```json
[
  {
    "bucket": "2026-04",
    "kwh": 214.5,
    "waterM3": 11.2,
    "avgPowerW": 297.9,
    "avgFlowLpm": 1.8
  }
]
```

### Antarmuka Pengguna

- TrendChart (dashboard admin): komponen `TrendChart.tsx` di `UnitDetailPage.tsx` menampilkan grafik garis konsumsi kWh dan m³ dari `GET /reporting/trends/:unitNo`. Menggunakan Recharts `LineChart`.
- Grafik Konsumsi (mobile): `consumption-chart.tsx` menggunakan `AreaChart` Recharts untuk tren harian dan bulanan, diambil dari `GET /gateway/mobile/:unitNo/trends`.

### Verifikasi

| Aspek yang Diverifikasi                    | Metode Pengujian                                                                                                   | Hasil Terukur                                                                   | Batas Spesifikasi / B200                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Akurasi data konsumsi vs database langsung | Bandingkan nilai di dashboard dengan query SQL langsung untuk 9 kombinasi unit dan rentang waktu                   | Selisih 0 pada semua 9 kombinasi                                                | B200 #7: data operasional tersaji benar               |
| Agregasi aman terhadap sensor reset        | Masukkan row dengan nilai `energy_total` lebih kecil dari baris sebelumnya; cek output agregasi                    | Delta negatif di-clamp ke 0 oleh `GREATEST`; tidak ada nilai negatif di respons | Pendukung B200 #7: histori konsumsi tidak rusak       |
| Histori transaksi dan konsumsi tersedia    | Buka halaman transaksi dan grafik tren untuk unit uji; bandingkan dengan tabel `transactions` dan `meter_readings` | Data histori tampil sesuai database                                             | B200 #7: konsumsi, status, histori pembayaran tersaji |

### Kemungkinan Peningkatan

- **Caching hasil agregasi:** Query agregasi ke tabel `meter_readings` yang besar bisa memakan waktu lebih lama seiring bertambahnya unit. Apakah Redis cache dengan TTL 5 menit per kombinasi `(unitNo, period)` perlu ditambahkan adalah keputusan operator yang bergantung pada jumlah unit aktif dan SLA waktu respons yang disepakati.
- **Endpoint agregasi multi-unit:** Admin tidak bisa mendapatkan total konsumsi seluruh gedung dalam satu request. Penambahan `GET /reporting/building/:code/trend` adalah keputusan fitur yang bergantung pada kebutuhan admin untuk pelaporan gedung.

---

## Sub-Sistem 6: Anomaly Module

### Implementasi

Anomaly Module mendeteksi 12 jenis kondisi tidak normal pada pengukuran listrik dan air, menyimpannya ke database, mengirimkan perintah keselamatan otomatis ke hardware, dan memicu notifikasi ke admin dan resident.

**Arsitektur Internal: Tiga Service**

Untuk menjaga kode tetap bisa diuji, Anomaly Module dibagi menjadi tiga service:

1. `AnomalyDetectionService`: service deteksi murni tanpa akses database atau MQTT. Menerima snapshot data sebagai input dan mengembalikan daftar anomali sebagai output. Ini memungkinkan 87 unit test dijalankan tanpa infrastruktur database atau broker.
2. `AnomalyService`: orchestrator utama yang mengatur jadwal pengecekan, mengelola cache in-memory, mengkoordinasikan persistensi, dan memicu perintah keselamatan.
3. `AnomalyNotificationService`: mengurus pengiriman notifikasi ke resident dan admin melalui Telegram, dengan cooldown per-unit per-jenis anomali.

**Semua Threshold Deteksi (dari `anomaly.constants.ts`)**

| Konstanta                            | Nilai                  | Makna                                                       |
| ------------------------------------ | ---------------------- | ----------------------------------------------------------- |
| `mcbWattLimit`                       | 1.300 W                | Batas daya MCB; MCB trip jika daya 0 saat relay aktif       |
| `lowElectricityTokenKwh`             | 5 kWh                  | Saldo listrik dianggap hampir habis                         |
| `lowWaterTokenM3`                    | 1 m³                   | Saldo air dianggap hampir habis                             |
| `offlineThresholdMs`                 | 600.000 ms (10 menit)  | Device dianggap offline                                     |
| `safeVoltageMinVolts`                | 198 V                  | Batas tegangan aman minimum (warning)                       |
| `safeVoltageMaxVolts`                | 242 V                  | Batas tegangan aman maksimum (warning)                      |
| `criticalVoltageMinVolts`            | 180 V                  | Batas tegangan kritis minimum (critical)                    |
| `criticalVoltageMaxVolts`            | 250 V                  | Batas tegangan kritis maksimum (critical)                   |
| `waterLeakMaxCoefficientOfVariation` | 0,20                   | CoV aliran air ≤ 0,20 dianggap bocor                        |
| `waterLeakMinFlowLitresPerMin`       | 0,3 L/menit            | Minimum aliran untuk pengecekan kebocoran                   |
| `waterLeakMinReadingCount`           | 30                     | Minimum reading untuk analisis kebocoran                    |
| `lowPowerFactorThreshold`            | 0,60                   | Power factor di bawah 0,60 = warning                        |
| `lowPowerFactorMinWatts`             | 50 W                   | Minimum daya sebelum power factor diperiksa                 |
| `lowPowerFactorMinAmps`              | 0,1 A                  | Minimum arus sebelum power factor diperiksa                 |
| `usageSpikeMultiplier`               | 3,0×                   | Konsumsi dianggap lonjakan jika lebih dari 3× baseline      |
| `usageSpikeMinBaselineWatts`         | 100 W                  | Baseline minimum untuk deteksi lonjakan                     |
| `usageSpikeMinCurrentWatts`          | 500 W                  | Daya minimum agar lonjakan dianggap signifikan              |
| `usageSpikeBaselineWindowSize`       | 5 reading              | Jumlah reading untuk rata-rata baseline                     |
| `usageSpikeReadingWindowSize`        | 10 reading             | Jumlah reading untuk rata-rata saat ini                     |
| `zeroFlowMaxLitresPerMin`            | 0,05 L/menit           | Di bawah ini aliran dianggap nol                            |
| `zeroFlowMinReadingCount`            | 15                     | Minimum reading zero-flow sebelum deteksi aktif             |
| `zeroFlowWindowSize`                 | 20 reading             | Window untuk deteksi zero-flow                              |
| `backflowThresholdLitresPerMin`      | -0,1 L/menit           | Aliran di bawah nilai ini dianggap backflow                 |
| `jailbreakMinPowerWatts`             | 5 W                    | Minimum daya untuk dianggap jailbreak                       |
| `jailbreakMinFlowLitresPerMin`       | 0,1 L/menit            | Minimum aliran untuk dianggap jailbreak penggunaan air      |
| `sensorMalfunctionWindowSize`        | 10 reading             | Window untuk deteksi malfungsi sensor                       |
| `sensorMalfunctionMinReadings`       | 5 reading              | Minimum reading valid dalam window                          |
| `telemetryThrottleMs`                | 30.000 ms              | Throttle refresh cache anomali                              |
| `adminAlertCooldownMs`               | 900.000 ms (15 menit)  | Cooldown notifikasi admin per-unit per-jenis                |
| `offlineCheckIntervalMs`             | 300.000 ms (5 menit)   | Interval pengecekan seluruh unit untuk deteksi offline      |
| `offlineCheckInitialDelayMs`         | 10.000 ms              | Delay sebelum pengecekan offline pertama saat startup       |
| `safetyCommandCooldownMs`            | 300.000 ms (5 menit)   | Cooldown perintah keselamatan otomatis per-device           |
| `mqttRecentArrivalWindowMs`          | 60.000 ms              | Jika telemetri terakhir dalam 1 menit, unit dianggap online |
| `memoryPruneAgeMs`                   | 86.400.000 ms (24 jam) | Entri in-memory map dihapus jika tidak ada aktivitas        |
| `anomalyCacheMaxSize`                | 5.000 unit             | Jika cache melebihi batas ini, 50% entri terlama dievict    |
| `meterReadingsWindowSize`            | 60 reading             | Jumlah reading terakhir yang diambil untuk analisis         |
| `offlineStreamChunkSize`             | 100 unit               | Unit per batch saat pengecekan offline                      |

**Algoritma Kebocoran Air (CoV)**

Coefficient of Variation (CoV) dihitung sebagai standar deviasi dibagi rata-rata. Aliran air yang bocor secara terus-menerus memiliki nilai yang sangat konsisten, menghasilkan CoV yang rendah (mendekati 0). Aliran normal yang tergantung penggunaan bervariasi lebih tinggi. Threshold CoV ≤ 0,20 dengan minimum aliran 0,3 L/menit dan minimum 30 reading untuk menghindari false positive.

**Admin Alert Cooldown per-Unit**

Cooldown notifikasi admin diimplementasikan dengan `Map<string, number>` di mana key adalah `"anomalyType:unitNumber"`. Ini memastikan anomali yang sama di dua unit berbeda dapat memicu notifikasi secara independen, alih-alih diblokir oleh cooldown unit yang satu.

**Pengecekan Offline dengan Async Generator**

Scheduler berjalan setiap 5 menit. Setiap siklus, ia mengambil semua unit dalam batch 100 unit menggunakan async generator dari `UnitService.streamAllWithDevice()`. Teknik ini mencegah semua unit dimuat ke memory sekaligus; untuk 2.444 unit, ini krusial untuk menghindari out-of-memory.

**Fungsi Utama**

- `detectAll(ctx)`: jalankan semua 12 detektor, kembalikan `AnomalyItem[]`.
- `checkOnTelemetry(...)`: hot-path dipanggil setiap telemetri masuk.
- `emitSafetyCommandsIfRequired(deviceId, ctx)`: deteksi kondisi bahaya, publish MQTT dengan cooldown.
- `checkOfflineUnits()`: scheduler 5 menit; stream semua unit.
- `syncAnomaliesToDatabase(unitNumber, computed)`: resolve anomali lama, insert anomali baru.
- `computeAndCacheAnomalies(unitNumber)`: ambil 60 reading, panggil detectAll, simpan ke Map.
- `pruneMaps()`: evict entri Map tidak aktif lebih dari 24 jam; LRU eviction jika cache melebihi 5.000 entri.
- `getActiveAnomalies(query)`: paginated list anomali aktif dengan filter.
- `getAnomalyStats()`: aggregate counts per tipe dan severity.

### Antarmuka Data

**12 Tipe Anomali Deteksi**

| Tipe                    | Severity         | Kondisi Deteksi                                                      | Target Notifikasi |
| ----------------------- | ---------------- | -------------------------------------------------------------------- | ----------------- |
| `jailbreak`             | critical         | Daya aktif saat relay OFF                                            | admin + resident  |
| `water_leak`            | warning          | CoV aliran air ≤ 0,20 dengan aliran > 0,3 L/menit                    | admin + resident  |
| `device_offline`        | critical         | Tidak ada telemetri lebih dari 10 menit                              | admin             |
| `mcb_trip`              | warning          | Daya nol sementara relay ON (MCB trip terdeteksi)                    | admin + resident  |
| `low_electricity_token` | warning          | Saldo listrik di bawah 5 kWh                                         | resident          |
| `low_water_token`       | warning          | Saldo air di bawah 1 m³                                              | resident          |
| `voltage_anomaly`       | warning/critical | Tegangan di luar range 198–242 V (warning) atau 180–250 V (critical) | admin + resident  |
| `sensor_malfunction`    | warning          | Kurang dari 5 reading valid dalam window 10 reading                  | admin             |
| `low_power_factor`      | warning          | Power factor di bawah 0,60                                           | admin             |
| `usage_spike`           | warning          | Konsumsi lebih dari 3× rata-rata baseline                            | admin + resident  |
| `zero_flow`             | warning          | Aliran nol sementara valve OPEN selama 15+ reading                   | admin             |
| `backflow`              | critical         | Aliran negatif (lebih dari -0,1 L/menit)                             | admin             |

**Respons GET /anomaly/active?page=1&limit=20**

```json
{
  "data": [
    {
      "id": 42,
      "deviceId": "ESP-001",
      "anomalyType": "voltage_anomaly",
      "severity": "warning",
      "message": "Tegangan di bawah batas aman: 195 V",
      "metadata": { "voltageV": 195 },
      "detectedAt": "2026-05-24T10:00:00.000Z",
      "resolvedAt": null
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

**Respons GET /anomaly/stats**

```json
{
  "totalActive": 5,
  "totalResolved": 142,
  "countByType": {
    "voltage_anomaly": 2,
    "device_offline": 1,
    "low_electricity_token": 2
  },
  "countBySeverity": {
    "critical": 1,
    "warning": 4
  }
}
```

### Antarmuka Pengguna

- Widget Recent Alerts (dashboard admin): `RecentAlerts.tsx` di `DashboardPage.tsx` menampilkan 5 anomali terbaru dari `GET /anomaly/active?limit=5`.
- Panel Anomali Unit (dashboard admin): `UnitDetailPage.tsx` menampilkan daftar anomali aktif dan historis untuk unit yang dipilih.
- Halaman Anomali (dashboard admin): `AnomaliesPage.tsx` dengan filter tipe dan severity.
- Alert Banner (mobile): `alert-banner.tsx` menampilkan peringatan anomali resident dari `GET /gateway/mobile/:unitNo/notifications`.
- Statistik Anomali (admin): widget overview dari `GET /anomaly/stats`.

### Verifikasi

| Skenario                                    | Metode Pengujian                                                                                         | Hasil Terukur                                                                            | Batas Spesifikasi                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Offline detection ke dashboard/admin        | Putuskan device secara paksa; ukur T0 saat gangguan dan T1 saat alert tampil/tercatat untuk admin        | Alert dikirim setelah device melewati threshold offline dan siklus pengecekan berikutnya | B200 #8: <= 90 detik sejak gangguan terdeteksi oleh sistem |
| Jailbreak detection                         | Simulasikan arus masuk dengan relay OFF; ukur waktu hingga alert dan relay cut-off terkirim; 3 percobaan | Seluruhnya di bawah 23 detik                                                             | B200 #8: <= 90 detik                                       |
| Unit test detection service                 | Jalankan `npm run test` untuk pure detection rules                                                       | 87 test lulus, 0 gagal                                                                   | Pendukung B200 #8: rule deteksi stabil                     |
| Resolusi anomali saat device kembali online | Online-kan kembali device setelah 15 menit offline                                                       | `resolved_at` terisi di DB; cache unit menghapus item `device_offline`                   | Pendukung B200 #7/#8: status operasional kembali normal    |

### Kemungkinan Peningkatan

- **Threshold per-unit:** Threshold CoV kebocoran air (0,20) berlaku sama untuk semua unit terlepas dari karakteristik instalasi pipa masing-masing. Jika pengelola gedung menemukan bahwa unit-unit di lantai tertentu memiliki pola aliran yang berbeda secara struktural, threshold per-unit dapat disimpan di tabel `calibration_settings` sebagai parameter operasional yang dapat disesuaikan tanpa mengubah kode.

---

## Sub-Sistem 7: Admin Module

### Implementasi

Admin Module adalah back-office dari sistem yang menangani manajemen data gedung, resident, unit, tariff, akses admin, audit trail, health monitoring, dan pembersihan data berkala.

**Health Monitoring**

Endpoint `GET /health/check` menjalankan lima pengecekan secara paralel menggunakan `Promise.all()`:

- Database (MySQL): Query `SELECT 1` via TypeORM QueryRunner. Mengukur latensi dalam milidetik. Jika gagal, status overall menjadi 'critical'.
- Redis: Buka koneksi TCP ke host dan port Redis. Jika gagal, status overall menjadi 'degraded'.
- MQTT (EMQX): Buka koneksi TCP ke host dan port broker dari `MQTT_BROKER_URL`. Jika gagal, status overall menjadi 'critical'.
- SMTP: Periksa apakah variabel environment `SMTP_HOST`, `SMTP_USER`, dan `SMTP_PASS` dikonfigurasi. Tidak ada probe koneksi live.
- Telegram: Periksa apakah `TELEGRAM_BOT_TOKEN` dikonfigurasi.

**Manajemen Tariff**

Tariff disimpan dalam tabel `tariffs` dengan `effective_date`. Setiap perubahan tariff menambahkan baris baru tanpa menghapus baris lama, mempertahankan histori perubahan harga. Tariff aktif selalu diambil dari baris dengan `effective_date` terbaru yang tidak melebihi tanggal hari ini. Admin bisa menetapkan tariff masa depan tanpa mempengaruhi transaksi yang sedang berjalan.

**Async Generator untuk Batch Processing**

`UnitService.streamAllWithDevice(chunkSize)` adalah async generator yang mengambil unit dalam batch 100 per iterasi, dengan delay 20 milidetik antar batch untuk memberi waktu event loop Node.js memproses event lain. Ini krusial untuk gedung dengan 2.444 unit agar tidak terjadi out-of-memory.

**Data Retention**

`RetentionService.handleRetention()` dijalankan setiap hari pukul 03:00 via `@Cron(CronExpression.EVERY_DAY_AT_3AM)`. Ia menghapus: (1) baris `meter_readings` yang usianya lebih dari 24 bulan, dan (2) baris `transactions` yang usianya lebih dari 60 bulan. Implementasi saat ini memakai TypeORM query builder `delete()` untuk kedua tabel, bukan `ALTER TABLE DROP PARTITION`.

**Audit Log**

Tabel `audit_logs` adalah immutable: tidak ada endpoint untuk menghapus atau mengubah record. Setiap baris menyimpan: `actor` (email atau 'system'), `action`, `target_type`, `target`, `details` (JSON), dan `result`.

**Fungsi Utama**

- `check()` di `health.service.ts`: paralel health probe ke 5 layanan, kembalikan `HealthReport`.
- `upsertFromGoogle(profile)` di `residents.service.ts`: INSERT ... ON DUPLICATE KEY UPDATE.
- `streamAllWithDevice(chunkSize)` di `unit.service.ts`: async generator, batch 100 unit.
- `creditToken(unitNo, electricityKwh, waterM3)`: atomic UPDATE pada saldo token.
- `getCurrentTariff(type)` di `tariff.service.ts`: SELECT dengan `effective_date <= NOW()` ORDER BY DESC LIMIT 1.
- `log(actor, action, ...)` di `audit-log.service.ts`: INSERT immutable record.
- `handleRetention()` di `retention.service.ts`: hapus data lama.

### Antarmuka Data

**Respons GET /health/check**

```json
{
  "checkedAt": "2026-05-24T14:30:00.000Z",
  "overall": "healthy",
  "services": {
    "database": { "status": "ok", "latencyMs": 2 },
    "redis": { "status": "ok", "latencyMs": 1 },
    "mqtt": { "status": "ok", "latencyMs": 3 },
    "smtp": { "status": "configured" },
    "telegram": { "status": "configured" }
  }
}
```

Field `overall`: `"healthy"` jika semua ok, `"degraded"` jika Redis down, `"critical"` jika Database atau MQTT down.

**Respons GET /admin/tariff** (tariff aktif saat ini)

```json
{
  "id": 5,
  "electricityRatePerKwh": 1500,
  "waterRatePerM3": 5000,
  "effectiveDate": "2026-01-01",
  "createdAt": "2025-12-15T10:00:00.000Z"
}
```

**Respons GET /admin/anomalies/:unitNo** (daftar anomali unit)

```json
[
  {
    "id": 42,
    "deviceId": "ESP-001",
    "anomalyType": "voltage_anomaly",
    "severity": "warning",
    "message": "Tegangan di bawah batas aman: 195 V",
    "metadata": { "voltageV": 195 },
    "detectedAt": "2026-05-24T10:00:00.000Z",
    "resolvedAt": null
  }
]
```

**Record Audit Log (tabel `audit_logs`)**

| Kolom       | Tipe               | Contoh Nilai                                   |
| ----------- | ------------------ | ---------------------------------------------- |
| id          | INT AUTO_INCREMENT | 1001                                           |
| actor       | VARCHAR            | "admin@gedung.com" atau "system"               |
| action      | VARCHAR            | "relay_on", "token_credited", "tariff_created" |
| target_type | VARCHAR            | "unit", "device", "resident", "transaction"    |
| target      | VARCHAR            | "A-101", "ESP-001"                             |
| details     | JSON               | `{"amount": 150000, "method": "qris"}`         |
| result      | VARCHAR            | "success", "failure", "info"                   |
| created_at  | DATETIME           | 2026-05-24T14:30:00.000Z                       |

### Antarmuka Pengguna

- Panel Health (dashboard admin): `DashboardPage.tsx` menampilkan chip berwarna per layanan dari `GET /health/check`. Hijau = ok/configured, merah = error, abu = not_configured.
- Halaman Gedung (dashboard admin): `BuildingsPage.tsx` untuk melihat, menambahkan, dan mengelola gedung.
- Halaman Pengguna (dashboard admin): `UsersPage.tsx` menampilkan daftar resident, toggle role, dan Telegram chat ID.
- Halaman Log (dashboard admin): `LogsPage.tsx` menampilkan tabel audit log dengan filter aktor, aksi, dan rentang waktu.
- Halaman Tariff (dashboard admin): histori tariff dan penetapan tariff baru dengan `effective_date`.

### Verifikasi

| Aspek yang Diverifikasi             | Metode Pengujian                                                    | Hasil Terukur                                                    | Batas Spesifikasi / B200                     |
| ----------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| Health check layanan inti           | Akses `GET /health/check` saat MySQL, Redis, dan EMQX aktif         | Status `ok`/terkonfigurasi dengan `latencyMs` terukur            | Pendukung B200 #3/#4/#7: layanan server siap |
| Audit log perintah aktuator         | Kirim perintah relay dan valve dari dashboard; periksa `audit_logs` | Setiap perintah menghasilkan baris dengan aktor, aksi, dan hasil | B200 #5/#6: audit trail wajib                |
| Token credit atomic setelah payment | Proses pembayaran via webhook; verifikasi saldo token               | `token_electricity` dan `token_water` bertambah sesuai tariff    | B200 #4/#7: transaksi ACID dan histori benar |

### Kemungkinan Peningkatan

- **Calibration Settings endpoint:** Tabel `calibration_settings` ada di schema (kolom: `flowrate_factor`, `power_factor`, `sampling_time`) tetapi tidak ada endpoint CRUD untuk mengelolanya dari admin panel. Apakah admin perlu mengubah parameter kalibrasi sensor dari antarmuka web (alih-alih via flash firmware) adalah keputusan operasional yang bergantung pada prosedur maintenance tim elektro.
- **Health endpoint akses:** `GET /health/check` tidak memerlukan token. Informasi layanan yang down tidak sensitif secara bisnis, tetapi apakah akses perlu dibatasi adalah keputusan keamanan operasional yang bergantung pada kebijakan keamanan pengelola gedung.

---

## Sub-Sistem 8: Notification Module

### Implementasi

Notification Module adalah lapisan yang mendistribusikan pemberitahuan ke kanal pengiriman yang sesuai tanpa Anomaly Module perlu tahu ke mana notifikasi dikirim.

**Alur Notifikasi Anomali**

Saat `AnomalyService.syncAnomaliesToDatabase()` mendeteksi anomali baru, ia memanggil `AnomalyNotificationService.notifyResidentOfAnomaly()` dan `notifyAdminsOfAnomaly()` secara langsung. `AnomalyNotificationService` kemudian meneruskan ke Telegram Module.

Cooldown notifikasi admin diimplementasikan per-unit per-jenis anomali menggunakan key `"anomalyType:unitNumber"` di `adminAlertCooldownMap`. Ini memastikan bahwa anomali pada Unit A-101 tidak memblokir notifikasi untuk Unit B-202 dengan tipe anomali yang sama.

**Alur Notifikasi Payment**

Saat `PaymentsService` menerbitkan `PaymentCompletedEvent`, listener `notification/listeners/payment-completed.listener.ts` memeriksa apakah saldo token masih rendah setelah top-up, lalu mengirim konfirmasi top-up berhasil ke resident.

**Error Isolation**

Semua 4 listener `PaymentCompletedEvent` menggunakan try-catch. Jika satu listener gagal (misalnya Telegram tidak tersedia), listener lainnya tetap berjalan. Kegagalan notifikasi tidak membatalkan pencatatan audit log atau kredit token.

**Fungsi Utama**

- `notifyResidentOfAnomaly(email, item, unitNo)`: format pesan HTML, cari `telegram_chat_id` resident, panggil TelegramService.
- `notifyAdminsOfAnomaly(item, unitNo)`: fetch semua admin dengan telegram_chat_id, kirim alert ke masing-masing dengan cooldown per-unit.
- `notifyAdminsOfOfflineUnits(summaries)`: buat satu pesan digest berisi semua unit yang baru offline.
- `@OnEvent('payment.completed')`: handler EventEmitter2 untuk konfirmasi top-up ke resident.

### Antarmuka Data

Notification Module tidak memiliki endpoint HTTP sendiri. Outputnya berupa pesan Telegram yang formatnya didokumentasikan di Sub-Sistem 9.

### Antarmuka Pengguna

Output modul ini terlihat di:

- Telegram Chat Admin: pesan alert anomali dikirim oleh modul ini.
- Telegram Chat Resident: pesan peringatan token hampir habis dan konfirmasi top-up.
- Secara tidak langsung via Anomaly Module: data anomali yang disimpan ke database (ditampilkan di dashboard dan mobile).

### Verifikasi

| Aspek yang Diverifikasi                                | Metode Pengujian                                                                 | Hasil Terukur                                 | Batas Spesifikasi / B200                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| Alert anomali diteruskan dalam batas waktu             | Diukur bersama Anomaly Module dari deteksi hingga alert admin/dashboard/Telegram | Maksimum 23 detik dari deteksi                | B200 #8: <= 90 detik                             |
| Batch offline untuk banyak unit                        | Simulasikan beberapa unit offline sekaligus                                      | Satu ringkasan alert berisi unit-unit offline | Pendukung B200 #8: gangguan massal tetap terbaca |
| Kegagalan kanal notifikasi tidak memblokir proses lain | Simulasikan Telegram error; verifikasi audit log dan credit token tetap berjalan | Listener lain tetap berjalan                  | Pendukung B200 #4/#7/#8: error isolation         |

### Kemungkinan Peningkatan

- **Delivery receipt:** Saat ini tidak ada konfirmasi apakah pesan Telegram berhasil diterima. Apakah respons dari Telegram API perlu dicatat ke `audit_logs` adalah keputusan operasional yang bergantung pada kebutuhan audit pengiriman notifikasi pengelola gedung.
- **Cooldown notifikasi resident:** Cooldown 15 menit diimplementasikan untuk admin. Apakah resident juga perlu cooldown (sehingga notifikasi berulang tidak mengganggu) atau sebaliknya resident harus selalu dinotifikasi adalah keputusan UX yang ditentukan oleh pengelola gedung bersama penghuni.

---

## Sub-Sistem 9: Telegram Module

### Implementasi

Telegram Module menerima payload pesan yang sudah diformat dan mengirimkannya ke Telegram Bot API via HTTPS. Modul ini tidak membuat keputusan tentang kapan atau kepada siapa pesan dikirim; semua keputusan itu dibuat oleh Notification Module.

**Cara Kerja Pengiriman**

Fungsi `sendMessage(chatId, html)` membuat HTTP POST ke `https://api.telegram.org/bot{BOT_TOKEN}/sendMessage` dengan body: `{ chat_id: chatId, text: html, parse_mode: 'HTML' }`. `BOT_TOKEN` diambil dari variabel environment `TELEGRAM_BOT_TOKEN`.

`chatId` adalah identifikasi unik chat antara admin/resident dengan bot. Resident mendapatkan chat ID ini dengan mengirim pesan ke bot, lalu admin memasukkan ID tersebut ke profil resident melalui `updateTelegramChatId()`. Hanya resident yang sudah menghubungkan akun Telegram-nya yang akan menerima notifikasi.

**Batch Notifikasi Offline**

Fungsi `formatOfflineBatch(summaries)` membuat satu pesan ringkasan untuk beberapa unit yang offline sekaligus, mencegah admin dibanjiri notifikasi jika terjadi pemadaman listrik yang mempengaruhi banyak unit.

**Webhook Secret Verification**

Handler `POST /telegram/webhook` memverifikasi header `X-Telegram-Bot-Api-Secret-Token` sebelum memproses update dari Telegram. Jika variabel `TELEGRAM_WEBHOOK_SECRET` dikonfigurasi di environment dan header tidak cocok, request ditolak dengan HTTP 401.

**Fungsi Utama**

- `sendMessage(chatId, html)`: HTTPS POST ke Bot API dengan HTML parse mode.
- `formatAnomalyAlert(item, unitNo)`: bangun string HTML lengkap berisi severity indicator, nama unit, tipe anomali, kondisi terukur, dan timestamp.
- `formatOfflineBatch(summaries)`: bangun satu pesan digest untuk beberapa unit offline.

### Antarmuka Data

**Format Pesan Telegram (string HTML, dikirim via Bot API)**

Pesan anomali kritis (contoh jailbreak):

```
🔴 <b>ANOMALI KRITIS</b>
Unit: <b>A-101</b>

Tipe: Bypass Relay Terdeteksi (<code>jailbreak</code>)
Daya: <b>450 W</b> terdeteksi saat relay dalam posisi OFF
Waktu: <b>2026-05-24 14:23:11 WIB</b>

Segera lakukan pemeriksaan fisik pada instalasi listrik unit.
```

Pesan anomali warning (contoh low token):

```
🟡 <b>PERINGATAN</b>
Unit: <b>A-101</b>

Tipe: Saldo Token Listrik Hampir Habis (<code>low_electricity_token</code>)
Sisa: <b>3,2 kWh</b>
Waktu: <b>2026-05-24 07:15:00 WIB</b>

Segera beli token listrik melalui aplikasi.
```

Pesan batch offline:

```
🔴 <b>PERANGKAT OFFLINE</b>

Unit-unit berikut tidak mengirim data dalam 10 menit terakhir:
- <b>A-101</b> (offline sejak 2026-05-24 14:00:00 WIB)
- <b>B-205</b> (offline sejak 2026-05-24 14:01:32 WIB)
- <b>C-312</b> (offline sejak 2026-05-24 14:03:11 WIB)
```

**Request ke Telegram Bot API**

```json
POST https://api.telegram.org/bot{BOT_TOKEN}/sendMessage
Content-Type: application/json

{
  "chat_id": "123456789",
  "text": "🔴 <b>ANOMALI KRITIS</b>...",
  "parse_mode": "HTML"
}
```

### Antarmuka Pengguna

Antarmukanya adalah aplikasi Telegram itu sendiri:

- Telegram Chat Admin: alert anomali dengan format HTML, serta digest batch offline.
- Telegram Chat Resident: notifikasi token hampir habis, kondisi anomali yang relevan, dan konfirmasi top-up berhasil.

### Verifikasi

| Aspek yang Diverifikasi                  | Metode Pengujian                                         | Hasil Terukur                                                  | Batas Spesifikasi / B200                         |
| ---------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Alert Telegram admin terkirim            | Trigger skenario jailbreak di produksi                   | Pesan diterima dalam rentang kurang dari 23 detik dari deteksi | Pendukung B200 #8: kanal tambahan <= 90 detik    |
| Batch offline dikirim sebagai satu pesan | Simulasikan 3 unit offline sekaligus                     | Satu pesan digest berisi ketiga unit                           | Pendukung B200 #8: alert gangguan massal terbaca |
| Webhook secret verification              | Kirim request ke `/telegram/webhook` tanpa header secret | Response HTTP 401 jika `TELEGRAM_WEBHOOK_SECRET` dikonfigurasi | Supporting security; bukan kriteria utama B200   |

### Kemungkinan Peningkatan

- **Perintah bot tambahan:** `telegram.controller.ts` sudah mengimplementasikan `/start` dan `/unlink`. Penambahan perintah seperti `/status A-101` atau `/anomali` adalah keputusan fitur yang bergantung pada apakah admin menginginkan antarmuka monitoring via Telegram selain dashboard web.

---

## Sub-Sistem 10: Dashboard (Admin Frontend)

### Implementasi

Dashboard adalah aplikasi web React 19 yang dibangun dengan Vite 7 dan di-serve sebagai file statis oleh Nginx pada port 3000. Komunikasi REST dengan backend dilakukan melalui fungsi `fetchApi()` di `src/lib/api.ts`, yang secara otomatis menyertakan access token dari `localStorage['admin-token']` sebagai header `Authorization: Bearer {token}`.

Request REST/JSON dikirim melalui HTTPS ke `VITE_API_BASE_URL`; wrapper dashboard memastikan base URL berakhir dengan `/api`. Selain REST, beberapa halaman dashboard juga membuka koneksi MQTT/WebSocket langsung ke EMQX (`VITE_MQTT_BROKER_URL`): `UnitDetailPage` untuk live telemetry unit, `DevicesPage` untuk status live perangkat, dan `ControlCenterPage` untuk ACK command/config/OTA.

**Routing**

Routing menggunakan React Router 7 dengan layout bersarang: `<ProtectedLayout>` melakukan redirect ke `/login` jika token tidak ada di localStorage. Semua halaman di bawah `/` membutuhkan token admin yang valid.

**Halaman Utama**

| Halaman        | Komponen                | Endpoint API Utama                                                                                    |
| -------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Login          | `LoginPage.tsx`         | `POST /auth/admin`                                                                                    |
| Dashboard      | `DashboardPage.tsx`     | `GET /health/check`, `GET /unit/connectivity`, `GET /anomaly/active?limit=5`                          |
| Gedung         | `BuildingsPage.tsx`     | `GET /admin/buildings`, `POST /admin/buildings`                                                       |
| Unit           | `UnitsPage.tsx`         | `GET /unit`, `POST /unit`, `PATCH /unit/:id`                                                          |
| Detail Unit    | `UnitDetailPage.tsx`    | `GET /unit/:id`, `GET /admin/anomalies/:unitNo`, `GET /reporting/trends/:unitNo`, `GET /admin/tariff` |
| Perangkat      | `DevicesPage.tsx`       | `GET /unit`, `GET /unit/connectivity`, MQTT `device/+/data`                                           |
| Pengguna       | `UsersPage.tsx`         | `GET /admin/residents`, `POST /admin/residents`, assign/unassign unit                                 |
| Transaksi      | `TransactionsPage.tsx`  | `GET /admin/transactions`                                                                             |
| Log            | `LogsPage.tsx`          | `GET /admin/audit-logs`                                                                               |
| Tariff         | `TariffsPage.tsx`       | `GET /admin/tariff`, `POST /admin/tariff`                                                             |
| Control Center | `ControlCenterPage.tsx` | `POST /admin/command`, `POST /admin/push-config`, `POST /admin/ota`, `GET/POST/PATCH /admin/tariff`   |
| FAQ            | `FAQPage.tsx`           | Tidak ada API call; konten statis                                                                     |

**Komponen Chart**

Dashboard menggunakan Recharts untuk visualisasi data. Komponen chart utama:

- `TrendChart.tsx`: Recharts `LineChart` dengan dua series (kWh dan m³) dari data `TrendPoint[]`.
- `RecentAlerts.tsx`: Daftar anomali terbaru dengan badge severity berwarna.
- `HealthPanel.tsx`: Grid chip layanan dari `HealthReport`.
- `TowerComparisonChart.tsx`: Recharts `BarChart` perbandingan konsumsi antar tower.

**Autentikasi di Frontend**

Setelah Google Sign-In berhasil dan `POST /api/auth/admin` mengembalikan token, access token disimpan di `localStorage['admin-token']`. Setiap request berikutnya menyertakan token ini. Tidak ada mekanisme refresh token di dashboard; saat token kadaluarsa atau request mendapat 401/403, token dihapus dan pengguna diarahkan kembali ke halaman login/admin.

### Antarmuka Data

**Fungsi fetchApi (internal wrapper)**

```typescript
// Selalu menyertakan admin-token dari localStorage
const fetchApi = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const token = localStorage.getItem("admin-token");
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
};
```

**Komponen dan Props Utama**

| Komponen       | Props yang Diterima            | Data yang Ditampilkan      |
| -------------- | ------------------------------ | -------------------------- |
| `TrendChart`   | `data: TrendPoint[]`, `period` | Grafik konsumsi kWh dan m³ |
| `RecentAlerts` | `anomalies: AnomalyItem[]`     | Tabel anomali terbaru      |
| `HealthPanel`  | `health: HealthReport`         | Status chip per layanan    |
| `UnitTable`    | `units: Unit[]`                | Tabel unit dengan status   |

### Antarmuka Pengguna

Halaman-halaman berikut adalah antarmuka visual utama yang digunakan admin:

- **DashboardPage:** Widget health panel (5 chip layanan), widget recent alerts (5 anomali), widget tower connectivity, dan grafik konsumsi ringkasan.
- **UnitDetailPage:** Grafik konsumsi unit dengan selektor periode (harian/bulanan), panel anomali aktif dan historis unit, dan form penetapan tariff.
- **ControlCenterPage:** Toggle relay dan valve untuk beberapa unit sekaligus dengan konfirmasi.

### Verifikasi

| Aspek yang Diverifikasi               | Metode Pengujian                                                                    | Hasil Terukur                                          | Batas Spesifikasi / B200                              |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Dashboard menampilkan data terpusat   | Buka dashboard saat telemetry 2.444 client aktif; cek widget unit, status, dan tren | Data tampil dari API/backend terpusat                  | B200 #3: data air/listrik tersaji pada satu dashboard |
| Status online/offline perangkat       | Putuskan perangkat uji; cek perubahan status di dashboard                           | Status berubah menjadi Offline sesuai threshold sistem | B200 #7: status biner Online/Offline                  |
| Grafik tren akurat terhadap database  | Bandingkan nilai grafik dengan query langsung ke DB                                 | Nilai cocok dengan hasil SQL                           | B200 #7: konsumsi historis tersaji benar              |
| Alert gangguan tampil untuk pengelola | Trigger offline/jailbreak; cek panel anomali/recent alert dashboard                 | Alert tercatat/tampil pada dashboard                   | B200 #8: alert pengelola <= 90 detik                  |

### Kemungkinan Peningkatan

- **Durasi polling dapat dikonfigurasi:** Interval polling per komponen saat ini di-hardcode di masing-masing komponen. Jika admin menginginkan refresh yang lebih cepat atau lebih lambat untuk komponen tertentu, interval dapat dijadikan konfigurasi pengguna yang disimpan di localStorage.
- **Export data:** Admin saat ini tidak dapat mengunduh data tabel (unit, transaksi, log) sebagai CSV atau Excel. Penambahan tombol export adalah keputusan fitur yang bergantung pada kebutuhan pelaporan pengelola gedung.

---

## Sub-Sistem 11: Mobile App (Resident Frontend)

### Implementasi

Mobile App adalah aplikasi web React 19 yang dibangun dengan Vite 7 dan Radix UI, di-serve oleh Nginx pada port 8080 dan diakses melalui browser smartphone resident. Komunikasi dengan backend dilakukan melalui fungsi `request()` di `src/lib/api.ts`, yang secara otomatis menyertakan access token dari `localStorage['mobile_access_token']` dan melakukan refresh token secara transparan saat menerima HTTP 401.

**Manajemen Token di Mobile**

Mobile app mengimplementasikan mekanisme refresh token yang tidak dimiliki dashboard:

1. Setiap request menggunakan access token dari `localStorage['mobile_access_token']`.
2. Jika respons HTTP 401 diterima dan refresh token tersedia, fungsi `refreshAccessToken()` dipanggil. Ini mengirim `POST /auth/refresh` dan menyimpan pasangan token baru.
3. Request original diulang satu kali dengan access token yang baru.
4. Jika refresh gagal (misalnya refresh token sudah kadaluarsa atau direvoke), `authStore.clear()` dipanggil yang menghapus kedua token dan mendispatch event `auth:cleared`. Komponen React yang mendengarkan event ini menampilkan layar login.

**Routing dan State**

Navigasi menggunakan state React murni (bukan React Router) dengan enum halaman. Halaman dilindungi oleh komponen `ProtectedRoute` yang memeriksa keberadaan token dan state autentikasi.

**Halaman Utama**

| Halaman           | Deskripsi                                            | Endpoint API Utama                                |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Login             | Google Sign-In                                       | `POST /auth/google`                               |
| Pilih Unit        | Daftar unit yang terdaftar untuk email user          | `POST /auth/select-unit`                          |
| Dashboard (Home)  | Snapshot saldo, status relay/valve, indikator online | `GET /gateway/mobile/:unitNo/dashboard`           |
| Notifikasi        | Daftar anomali dan konfirmasi topup                  | `GET /gateway/mobile/:unitNo/notifications`       |
| Tren Konsumsi     | Grafik harian/bulanan kWh dan m³                     | `GET /gateway/mobile/:unitNo/trends?period=daily` |
| Beli Token        | Form top-up dengan pilihan metode                    | `POST /gateway/mobile/:unitNo/topup/initiate`     |
| Status Pembayaran | Polling status transaksi                             | `GET /gateway/mobile/:unitNo/topup/status/:id`    |
| Riwayat Transaksi | Daftar transaksi dengan status                       | `GET /gateway/mobile/:unitNo/transactions`        |
| Invoice           | Unduhan invoice plain-text                           | `GET /gateway/mobile/:unitNo/invoice/:id`         |
| Akun              | Info user dan tombol logout                          | `GET /auth/me`                                    |

**Komponen ANOMALY_META**

Komponen mobile mendefinisikan `ANOMALY_META`, sebuah record TypeScript yang memetakan setiap `AnomalyType` ke label tampilan (dalam Bahasa Indonesia), ikon Lucide React, dan teks tindakan yang disarankan.

Tabel lengkap:

| anomalyType             | Label                      | Tindakan yang Disarankan                                                   |
| ----------------------- | -------------------------- | -------------------------------------------------------------------------- |
| `low_electricity_token` | Token Listrik Hampir Habis | Segera beli token listrik di menu Beli Token.                              |
| `low_water_token`       | Token Air Hampir Habis     | Segera beli token air di menu Beli Token.                                  |
| `mcb_trip`              | MCB Trip / Overload        | Kurangi beban listrik, lalu nyalakan ulang relay dari Beranda.             |
| `water_leak`            | Kebocoran Air              | Periksa seluruh kran dan pipa. Hubungi teknisi jika tidak ditemukan.       |
| `voltage_anomaly`       | Tegangan Tidak Normal      | Hentikan pemakaian perangkat sensitif dan laporkan ke pengelola.           |
| `sensor_malfunction`    | Sensor Tidak Berfungsi     | Hubungi teknisi untuk pemeriksaan sensor dan kabel.                        |
| `low_power_factor`      | Faktor Daya Rendah         | Kurangi beban induktif atau hubungi teknisi listrik.                       |
| `usage_spike`           | Lonjakan Konsumsi          | Periksa perangkat yang baru dinyalakan. Matikan yang tidak diperlukan.     |
| `jailbreak`             | Bypass Sistem              | Hubungi pengelola gedung segera.                                           |
| `device_offline`        | Perangkat Offline          | Hubungi pengelola untuk pemeriksaan perangkat.                             |
| `zero_flow`             | Aliran Air Nol             | Valve terbuka namun tidak ada aliran. Periksa pipa atau hubungi pengelola. |
| `backflow`              | Aliran Air Balik           | Terdeteksi aliran balik. Hubungi teknisi segera.                           |
| `topup_success`         | Pembelian Token Berhasil   | (tidak ada tindakan; ini adalah konfirmasi informasional)                  |

**Dependency Utama**

- Radix UI + shadcn: komponen aksesibel (Dialog, Dropdown, Toast) yang di-style dengan Tailwind CSS 4.
- React Hook Form + Zod: validasi form pembelian token.
- Recharts: AreaChart untuk grafik konsumsi.
- Vitest: test suite untuk logika non-UI.

### Antarmuka Data

**authStore (in-memory + localStorage state)**

```typescript
// Operasi yang tersedia
authStore.getToken(); // Baca mobile_access_token dari localStorage
authStore.getRefreshToken(); // Baca mobile_refresh_token dari localStorage
authStore.setTokens(at, rt); // Simpan keduanya ke localStorage
authStore.clear(); // Hapus keduanya + dispatch 'auth:cleared' event
```

**Tipe AnomalyType (TypeScript union)**

```typescript
type AnomalyType =
  | "jailbreak"
  | "water_leak"
  | "device_offline"
  | "mcb_trip"
  | "low_electricity_token"
  | "low_water_token"
  | "voltage_anomaly"
  | "sensor_malfunction"
  | "low_power_factor"
  | "usage_spike"
  | "zero_flow"
  | "backflow"
  | "topup_success";
```

**Tipe DashboardSummary (response dari backend)**

```typescript
type DashboardSummary = {
  id: number;
  unitNo: string;
  tokenElectricity: number; // kWh tersisa
  tokenWater: number; // m³ tersisa
  energyTariff: number; // Rp/kWh
  waterTariff: number; // Rp/m³
  relayStatus: boolean;
  valveStatus: boolean;
  remainingEstimate: {
    kwh: number;
    hours: number;
  };
  connectivity: {
    online: boolean;
    lastTelemetryAt: string | null;
  };
};
```

### Antarmuka Pengguna

- **Halaman Dashboard:** Kartu saldo token listrik dan air, indikator online/offline perangkat, toggle relay dan valve, dan estimasi sisa jam penggunaan.
- **Halaman Notifikasi:** Daftar notifikasi diurutkan terbaru; setiap item menampilkan label, ikon, dan teks tindakan dari `ANOMALY_META`. Notifikasi `topup_success` ditampilkan sebagai informasi hijau.
- **Halaman Beli Token:** Form dengan input Rupiah untuk listrik dan air, tampilan tariff saat ini dari `GET /admin/tariff`, dropdown metode pembayaran, dan tombol konfirmasi.
- **Status Pembayaran:** Layar polling yang menampilkan status transaksi dan instruksi pembayaran (QR code atau nomor virtual account).

### Verifikasi

| Aspek yang Diverifikasi             | Metode Pengujian                                                                             | Hasil Terukur                                    | Batas Spesifikasi / B200              |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| Top-up token dapat diakses resident | Jalankan pembelian token dari mobile pada skenario di luar jam loket; cek transaksi tercatat | Flow top-up berhasil dan status transaksi tampil | B200 #4: layanan digital 24/7         |
| Saldo dan histori transaksi tampil  | Setelah top-up sukses, cek dashboard mobile dan riwayat transaksi                            | Saldo berubah dan histori transaksi muncul       | B200 #7: histori pembayaran tersaji   |
| Resident hanya melihat data unitnya | Coba akses endpoint unit lain dengan token unit A                                            | Response HTTP 403 dari backend                   | B200 #7: data operasional terisolasi  |
| Notifikasi/anomali resident tampil  | Trigger anomali yang relevan untuk resident; buka halaman notifikasi                         | Anomali tampil dengan tipe yang sesuai           | Pendukung B200 #8 untuk sisi resident |

### Kemungkinan Peningkatan

- **Push Notification native:** Saat ini notifikasi hanya melalui Telegram. Apakah Web Push Notification browser (via Service Worker) perlu ditambahkan untuk resident yang tidak menggunakan Telegram adalah keputusan UX yang bergantung pada preferensi penghuni dan target platform mobile.
- **Bahasa antarmuka:** Seluruh antarmuka saat ini dalam Bahasa Indonesia. Dukungan multi-bahasa adalah keputusan bisnis yang bergantung pada profil penghuni gedung.

---

## Ringkasan Status Verifikasi Seluruh Sub-Sistem

| Sub-Sistem            | Kaitan B200  | Status Verifikasi   | Bukti Utama                                                                       | Catatan Gap                                                             |
| --------------------- | ------------ | ------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Gateway Module        | #3, #7       | Selesai sebagian    | PLR 0,43%; latensi maks 15 detik; CPU 53%; RAM 59%                                | Payload aktif binary 25 byte, bukan DLMS                                |
| Device Module         | #5, #6, #7   | Selesai sebagian    | Store-and-forward 0 frame hilang; relay 2,21 detik; valve 2,37 detik; audit log   | Uji fisik valve/relay final oleh tim IoT                                |
| Auth Module           | Pendukung #7 | Supporting verified | Token invalid ditolak; resident ditolak dari endpoint admin; logout revoke        | Bukan spesifikasi utama B200                                            |
| Payment Module        | #4, #7       | Selesai sebagian    | Availability 100%; webhook idempotent; signature verified; saldo update <60 detik | Perlu skenario eksplisit transaksi 19:01-07:59                          |
| Reporting Module      | #7           | Selesai sebagian    | Grafik cocok DB; LAG aman terhadap reset sensor; histori tampil                   | Perlu bukti lebih formal untuk histori skala penuh                      |
| Anomaly Module        | #8           | Selesai sebagian    | Unit test deteksi; jailbreak alert <23 detik; offline detection                   | Dashboard alert <=90 detik perlu dicatat eksplisit sebagai output utama |
| Admin Module          | #5, #6, #7   | Selesai sebagian    | Health check; audit log command; token credit atomic                              | Health check adalah pendukung, bukan bukti langsung B200                |
| Notification Module   | #8           | Selesai sebagian    | Alert diteruskan <23 detik; batch offline; error isolation                        | Telegram adalah kanal tambahan; dashboard tetap prioritas B200          |
| Telegram Module       | Pendukung #8 | Supporting verified | Alert admin; batch offline; webhook secret                                        | Bukan output utama B200 jika dashboard yang diminta                     |
| Dashboard (Frontend)  | #3, #7, #8   | Selesai sebagian    | Centralized display; status online/offline; grafik; alert panel                   | Perlu bukti manual/dashboard timing untuk alert <=90 detik              |
| Mobile App (Frontend) | #4, #7, #8   | Selesai sebagian    | Top-up flow; saldo/histori; resident isolation; notifikasi resident               | B200 fokus pengelola/dashboard, mobile mendukung resident               |

---

## Ringkasan Perbaikan yang Diimplementasikan

| Item                                         | Lokasi                                                                                       | Deskripsi                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tiga koneksi MQTT duplikat                   | `src/common/shared-mqtt-client.module.ts` (baru); gateway, device, anomaly module diperbarui | Satu MQTT client bersama menggantikan tiga instance terpisah              |
| Try-catch PaymentCompletedEvent              | Semua 4 listener: unit, audit-log, gateway, notification                                     | Kegagalan satu listener tidak menghentikan listener lain                  |
| LRU eviction anomaly cache                   | `anomaly.service.ts` `pruneMaps()`                                                           | Evict 50% entri terlama jika cache melebihi 5.000 entri                   |
| Retry Telegram API                           | `notification.service.ts` `sendTelegramQueued()`                                             | Exponential backoff 3 percobaan untuk HTTP 429 dan 5xx                    |
| Invoice tidak di-await di gateway            | `gateway.controller.ts` `invoice()`                                                          | Ditambahkan `await` sebelum `buildInvoiceForUnit()`                       |
| PaymentCompletedEvent emit sebelum save      | `payments.service.ts` `processPaymentStatusUpdate()` dan `autoConfirm()`                     | Dipindah: `txRepo.save()` dieksekusi sebelum `eventEmitter.emit()`        |
| Admin alert cooldown per-tipe global         | `anomaly-notification.service.ts` `adminAlertCooldownMap`                                    | Key diubah dari `anomalyType` menjadi `anomalyType:unitNumber`            |
| Sensor reset menangguhkan billing            | `device.service.ts` delta calculation                                                        | Jika nilai turun, baseline diperbarui dan delta = 0 (tidak suspend)       |
| Webhook IP allowlist kosong tanpa warning    | `payments.controller.ts`                                                                     | Log peringatan ditulis jika `PAYMENT_WEBHOOK_ALLOWED_IPS` kosong          |
| Reporting MAX-MIN rusak saat sensor reset    | `reporting.service.ts`                                                                       | Query diganti ke LAG() window function yang aman terhadap nilai turun     |
| Reporting endpoint tidak terproteksi         | `reporting.controller.ts`                                                                    | Ditambahkan `@UseGuards(AdminJwtGuard)`                                   |
| Unit connectivity endpoint tidak terproteksi | `admin/unit/unit.controller.ts`                                                              | Diubah dari JwtAuthGuard ke AdminJwtGuard                                 |
| Unit dashboard tanpa assertUnitAccess        | `admin/unit/unit.controller.ts`                                                              | Ditambahkan `assertUnitAccess(user, unitNo)`                              |
| Unit notifications tanpa assertUnitAccess    | `admin/unit/unit.controller.ts`                                                              | Ditambahkan `assertUnitAccess(user, unitNo)`                              |
| Telegram webhook tanpa verifikasi            | `telegram.controller.ts`                                                                     | Ditambahkan verifikasi `X-Telegram-Bot-Api-Secret-Token`                  |
| Payment endpoints tanpa guard                | `payments.controller.ts`                                                                     | Ditambahkan `@UseGuards(AdminJwtGuard)` pada topup, transactions, invoice |
| Mobile anomaly types tidak sinkron           | `frontend-ta/mobile/src/lib/api.ts`                                                          | Union type diperbarui: hapus `low_token`, tambah 4 tipe baru              |
| Mobile dead functions                        | `frontend-ta/mobile/src/lib/api.ts`                                                          | Hapus `getTowerConnectivity()` dan `getForecast()`                        |
| ANOMALY_META tidak lengkap                   | `frontend-ta/mobile/src/App.tsx`                                                             | Ditambahkan 5 entri baru sesuai tipe backend                              |
