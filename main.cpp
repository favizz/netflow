#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// --- KONFIGURASI WIFI & MQTT ---
const char* ssid        = "Nevatron";
const char* password    = "Nevatron!2024Ok";
const char* mqtt_server = "broker.emqx.io"; // Removed mqtt:// to fix DNS error
WiFiClientSecure espClient;
PubSubClient client(espClient);

// Device ID sesuai dengan Database (Unit A-101)
const char* device_id = "DEV-A-101";

// --- VARIABEL LOKAL UNTUK HYBRID EDGE-MANAGED ---
float   balance       = 150000.00;  // Local Balance Pool (diperbarui saat top-up)
float   energy_tariff = 1444.70;    // Harga per KWh
float   water_tariff  = 5000.00;    // Harga per m3

float et = 1250.00;  // Energy Total (KWh) - akumulasi
float wt = 180.00;   // Water Total (m3)   - akumulasi
int   rs = 1;        // Relay Status
int   vs = 1;        // Valve Status

// --- KALIBRASI (dapat diperbarui dari server via /config) ---
float   CAL_FACTOR_FLOWRATE  = 4.55;  // Faktor kalibrasi sensor aliran
float   CAL_FACTOR_POWER     = 1.05;  // Faktor kalibrasi sensor daya
uint8_t SENSOR_SAMPLING_TIME = 5;     // Interval kirim data (detik)

// =============================================================================
// PROTOKOL BINER KUSTOM — tanpa library tambahan, tanpa key/type tag
// =============================================================================
//
// TELEMETRY  (device → server)  21 byte,  topic: device/{id}/data
// ┌──────┬──────────────────────────────────────────────────────┐
// │Bytes │ Field          Tipe      Skala   Resolusi            │
// ├──────┼──────────────────────────────────────────────────────┤
// │  0–3 │ energy_total   uint32BE  ×100    0.01 kWh            │
// │  4–5 │ power          uint16BE  ×10     0.1  W              │
// │  6–7 │ voltage        uint16BE  ×10     0.1  V              │
// │  8–9 │ current        uint16BE  ×1000   0.001 A             │
// │ 10–11│ water_flow     uint16BE  ×100    0.01 L/min          │
// │ 12–15│ water_total    uint32BE  ×1000   0.001 m³            │
// │ 16–19│ balance        uint32BE  ×1      1 Rp                │
// │  20  │ flags          uint8     —       bit0=relay, bit1=valve│
// └──────┴──────────────────────────────────────────────────────┘
//
// COMMAND  (server → device)  1 byte,  topic: device/{id}/command
//   bits [7:4] = type   0x1=relay  0x2=valve
//   bits [3:0] = value  0=off/close  1=on/open
//   contoh: 0x11=relay ON  0x10=relay OFF  0x21=valve OPEN  0x20=valve CLOSE
//
// CALIBRATION  (server → device)  4 byte,  topic: device/{id}/config
//   [0:1] uint16BE = CAL_FACTOR_FLOWRATE × 100
//   [2]   uint8    = CAL_FACTOR_POWER    × 100
//   [3]   uint8    = SENSOR_SAMPLING_TIME
// =============================================================================

#define TELEMETRY_SIZE 21

static inline void writeU16BE(uint8_t* buf, uint16_t val) {
  buf[0] = (val >> 8) & 0xFF;
  buf[1] =  val       & 0xFF;
}

static inline void writeU32BE(uint8_t* buf, uint32_t val) {
  buf[0] = (val >> 24) & 0xFF;
  buf[1] = (val >> 16) & 0xFF;
  buf[2] = (val >>  8) & 0xFF;
  buf[3] =  val        & 0xFF;
}

void buildTelemetry(uint8_t* buf,
                    float et_val, float p_val, float v_val, float c_val,
                    float wf_val, float wt_val, float b_val,
                    int rs_val, int vs_val) {
  writeU32BE(buf +  0, (uint32_t)(et_val * 100  + 0.5f));
  writeU16BE(buf +  4, (uint16_t)(p_val  * 10   + 0.5f));
  writeU16BE(buf +  6, (uint16_t)(v_val  * 10   + 0.5f));
  writeU16BE(buf +  8, (uint16_t)(c_val  * 1000 + 0.5f));
  writeU16BE(buf + 10, (uint16_t)(wf_val * 100  + 0.5f));
  writeU32BE(buf + 12, (uint32_t)(wt_val * 1000 + 0.5f));
  writeU32BE(buf + 16, (uint32_t)(b_val          + 0.5f));
  buf[20] = (rs_val & 1) | ((vs_val & 1) << 1);
}

// --- Decode command 1 byte ---
void handleCommand(uint8_t b) {
  uint8_t type  = (b >> 4) & 0x0F;
  uint8_t value =  b       & 0x0F;
  if (type == 0x1) {
    rs = value;
    Serial.printf("[CMD] Relay → %s\n", rs ? "ON" : "OFF");
  } else if (type == 0x2) {
    vs = value;
    Serial.printf("[CMD] Valve → %s\n", vs ? "OPEN" : "CLOSE");
  }
}

// --- Decode calibration 4 byte ---
void handleCalibration(uint8_t* buf) {
  CAL_FACTOR_FLOWRATE  = ((buf[0] << 8) | buf[1]) / 100.0f;
  CAL_FACTOR_POWER     =   buf[2]                 / 100.0f;
  SENSOR_SAMPLING_TIME =   buf[3];
  Serial.printf("[CFG] cf=%.2f  cp=%.2f  st=%d\n",
                CAL_FACTOR_FLOWRATE, CAL_FACTOR_POWER, SENSOR_SAMPLING_TIME);
}

// --- Callback MQTT ---
void callback(char* topic, byte* payload, unsigned int length) {
  String t = String(topic);
  Serial.printf("[MQTT] Masuk: %s (%u byte)\n", topic, length);

  if (t.endsWith("/command") && length == 1) {
    handleCommand(payload[0]);
  } else if (t.endsWith("/config") && length == 4) {
    handleCalibration(payload);
  }
}

// --- Reconnect ---
void reconnect() {
  while (!client.connected()) {
    Serial.print("Menghubungkan ke MQTT Broker...");
    if (client.connect(device_id)) {
      Serial.println("Terhubung!");
      String base = "device/" + String(device_id);
      client.subscribe((base + "/command").c_str(), 1);
      client.subscribe((base + "/config").c_str(),  1);
    } else {
      Serial.printf("Gagal, status=%d  Coba lagi dalam 5 detik\n", client.state());
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("Memulai koneksi WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi terhubung! IP: " + WiFi.localIP().toString());

  espClient.setInsecure(); // Development only — ganti dengan setCACert() untuk produksi
  client.setServer(mqtt_server, 8883);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  // --- Simulasi pembacaan sensor (ganti dengan nilai hardware nyata) ---
  float raw_p  = (rs == 1) ? 650.00f + random(-50, 50) : 0.0f;
  float raw_wf = (vs == 1) ? 2.50f   + (random(-50, 50) / 100.0f) : 0.0f;

  // Terapkan faktor kalibrasi
  float p  = raw_p  * CAL_FACTOR_POWER;
  float wf = raw_wf * CAL_FACTOR_FLOWRATE;

  float v = 220.00f + random(-5, 5);
  float c = (rs == 1 && v > 0) ? p / v : 0.0f;

  // Akumulasi total per interval
  float dt          = SENSOR_SAMPLING_TIME;
  float addedEnergy = (p  / 3600.0f) * dt;
  float addedWater  = (wf / 1000.0f) * (dt / 60.0f);
  et += addedEnergy;
  wt += addedWater;

  // Deduct saldo lokal
  float cost = (addedEnergy * energy_tariff) + (addedWater * water_tariff);
  balance -= cost;

  // Auto-cutoff lokal (tidak butuh internet)
  if (balance <= 0 && (rs == 1 || vs == 1)) {
    balance = 0;
    rs = 0;
    vs = 0;
    Serial.println("⚠ PEMUTUSAN LOKAL: Saldo telah mencapai 0.");
  }

  // --- Kirim telemetri 21 byte ---
  uint8_t frame[TELEMETRY_SIZE];
  buildTelemetry(frame, et, p, v, c, wf, wt, balance, rs, vs);

  String dataTopic = "device/" + String(device_id) + "/data";
  if (client.publish(dataTopic.c_str(), frame, TELEMETRY_SIZE)) {
    Serial.printf("✅ Terkirim %dB | Rp:%.0f | %.1fW | %.2fLPM\n",
                  TELEMETRY_SIZE, balance, p, wf);
  } else {
    Serial.println("❌ Gagal publish — cek buffer size PubSubClient");
  }

  delay(SENSOR_SAMPLING_TIME * 1000);
}
