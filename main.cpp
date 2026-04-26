#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPUpdate.h>

// --- KONFIGURASI WIFI & MQTT ---
const char* ssid        = "Nevatron";
const char* password    = "Nevatron!2024Ok";
const char* mqtt_server = "broker.emqx.io";
const int   mqtt_port   = 8883;

// MQTT credentials — device authenticates with device_id + shared secret
const char* mqtt_device_secret = "";  // set MQTT_DEVICE_SECRET from server

WiFiClientSecure espClient;
PubSubClient client(espClient);

// Device ID sesuai dengan Database (Unit A-101)
const char* device_id = "DEV-A-101";

// --- VARIABEL LOKAL ---
float   balance       = 150000.00;
float   energy_tariff = 1444.70;
float   water_tariff  = 5000.00;

float et = 1250.00;  // Energy Total (KWh)
float wt = 180.00;   // Water Total (m3)
int   rs = 1;        // Relay Status
int   vs = 1;        // Valve Status

// --- KALIBRASI ---
float   CAL_FACTOR_FLOWRATE  = 4.55;
float   CAL_FACTOR_POWER     = 1.05;
uint8_t SENSOR_SAMPLING_TIME = 5;

// =============================================================================
// PUB / SUB TOPIC MAP
//
// SUBSCRIBE (server → device)
//   device/{id}/command  1 B   relay/valve toggle
//   device/{id}/config   4 B   calibration settings
//   device/{id}/ota      JSON  firmware update URL + version + size
//
// PUBLISH (device → server/browser)
//   device/{id}/data     21 B  telemetry frame (all consumers: backend + browser)
//
// BINARY FRAMES
// TELEMETRY  21 byte:
//   [0:3]  uint32BE  energy_total × 100   (kWh, 0.01 prec)
//   [4:5]  uint16BE  power        × 10    (W,   0.1  prec)
//   [6:7]  uint16BE  voltage      × 10    (V,   0.1  prec)
//   [8:9]  uint16BE  current      × 1000  (A,   0.001 prec)
//   [10:11]uint16BE  water_flow   × 100   (L/min, 0.01 prec)
//   [12:15]uint32BE  water_total  × 1000  (m³,  0.001 prec)
//   [16:19]uint32BE  balance               (Rp, integer)
//   [20]   uint8     flags  bit0=relay  bit1=valve
//
// COMMAND  1 byte:
//   bits[7:4] type  0x1=relay  0x2=valve
//   bits[3:0] value 0=off/close  1=on/open
//
// CALIBRATION  4 bytes:
//   [0:1] uint16BE  CAL_FACTOR_FLOWRATE × 100
//   [2]   uint8     CAL_FACTOR_POWER    × 100
//   [3]   uint8     SENSOR_SAMPLING_TIME
//
// OTA  JSON:
//   {"url":"https://host/fw-v1.2.0.bin","version":"1.2.0","size":524288}
// =============================================================================

#define TELEMETRY_SIZE 21

static inline void writeU16BE(uint8_t* buf, uint16_t val) {
  buf[0] = (val >> 8) & 0xFF; buf[1] = val & 0xFF;
}
static inline void writeU32BE(uint8_t* buf, uint32_t val) {
  buf[0] = (val >> 24) & 0xFF; buf[1] = (val >> 16) & 0xFF;
  buf[2] = (val >>  8) & 0xFF; buf[3] =  val        & 0xFF;
}

void buildTelemetry(uint8_t* buf,
                    float et_v, float p_v, float v_v, float c_v,
                    float wf_v, float wt_v, float b_v,
                    int rs_v, int vs_v) {
  writeU32BE(buf +  0, (uint32_t)(et_v * 100  + 0.5f));
  writeU16BE(buf +  4, (uint16_t)(p_v  * 10   + 0.5f));
  writeU16BE(buf +  6, (uint16_t)(v_v  * 10   + 0.5f));
  writeU16BE(buf +  8, (uint16_t)(c_v  * 1000 + 0.5f));
  writeU16BE(buf + 10, (uint16_t)(wf_v * 100  + 0.5f));
  writeU32BE(buf + 12, (uint32_t)(wt_v * 1000 + 0.5f));
  writeU32BE(buf + 16, (uint32_t)(b_v          + 0.5f));
  buf[20] = (rs_v & 1) | ((vs_v & 1) << 1);
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

// --- Decode calibration 4 bytes ---
void handleCalibration(uint8_t* buf) {
  CAL_FACTOR_FLOWRATE  = ((buf[0] << 8) | buf[1]) / 100.0f;
  CAL_FACTOR_POWER     =   buf[2]                 / 100.0f;
  SENSOR_SAMPLING_TIME =   buf[3];
  Serial.printf("[CFG] cf=%.2f  cp=%.2f  st=%d\n",
                CAL_FACTOR_FLOWRATE, CAL_FACTOR_POWER, SENSOR_SAMPLING_TIME);
}

// --- Handle OTA binary frame ---
// Frame: [major][minor][patch][flags][...binary_link_utf8]
//   flags bit0 = update_now,  bit1 = force
void handleOta(byte* payload, unsigned int length) {
  if (length < 4) { Serial.println("[OTA] Frame too short"); return; }

  uint8_t major = payload[0], minor = payload[1], patch = payload[2];
  uint8_t flags = payload[3];

  char url[512] = {0};
  size_t urlLen = length - 4;
  if (urlLen == 0) {
    Serial.println("[OTA] No URL in frame"); return;
  }
  if (urlLen >= sizeof(url)) { Serial.println("[OTA] URL too long"); return; }
  memcpy(url, payload + 4, urlLen);
  url[urlLen] = '\0';

  Serial.printf("[OTA] v%u.%u.%u  flags=0x%02X\n", major, minor, patch, flags);
  Serial.printf("[OTA] URL: %s\n", url);

  if (!(flags & 0x01)) { Serial.println("[OTA] update_now=0 — skipped"); return; }

  client.disconnect();
  WiFiClient otaClient;
  httpUpdate.setLedPin(LED_BUILTIN, LOW);
  t_httpUpdate_return ret = httpUpdate.update(otaClient, url);

  switch (ret) {
    case HTTP_UPDATE_FAILED:
      Serial.printf("[OTA] FAILED (%d): %s\n",
                    httpUpdate.getLastError(),
                    httpUpdate.getLastErrorString().c_str());
      break;
    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("[OTA] No update available");
      break;
    case HTTP_UPDATE_OK:
      Serial.println("[OTA] Flash OK — rebooting...");
      break;
  }
}

// --- MQTT callback ---
void callback(char* topic, byte* payload, unsigned int length) {
  String t = String(topic);
  Serial.printf("[MQTT] ← %s (%u B)\n", topic, length);

  if (t.endsWith("/command") && length == 1) {
    handleCommand(payload[0]);
  } else if (t.endsWith("/config") && length == 4) {
    handleCalibration(payload);
  } else if (t.endsWith("/ota")) {
    handleOta(payload, length);
  }
}

// --- Reconnect ---
void reconnect() {
  while (!client.connected()) {
    Serial.print("Menghubungkan ke MQTT Broker...");
    // Devices authenticate with device_id as username + shared secret as password
    if (client.connect(device_id, device_id, mqtt_device_secret)) {
      Serial.println("Terhubung!");
      String base = "device/" + String(device_id);
      client.subscribe((base + "/command").c_str(), 1);
      client.subscribe((base + "/config").c_str(),  1);
      client.subscribe((base + "/ota").c_str(),     1);
      Serial.printf("[MQTT] Subscribed to %s/{command,config,ota}\n", base.c_str());
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
    delay(500); Serial.print(".");
  }
  Serial.println("\nWiFi terhubung! IP: " + WiFi.localIP().toString());

  espClient.setInsecure(); // Dev only — use setCACert() for production
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
  client.setBufferSize(512); // needed for OTA JSON payload
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  // --- Simulasi sensor ---
  float raw_p  = (rs == 1) ? 650.00f + random(-50, 50) : 0.0f;
  float raw_wf = (vs == 1) ? 2.50f   + (random(-50, 50) / 100.0f) : 0.0f;

  float p  = raw_p  * CAL_FACTOR_POWER;
  float wf = raw_wf * CAL_FACTOR_FLOWRATE;
  float v  = 220.00f + random(-5, 5);
  float c  = (rs == 1 && v > 0) ? p / v : 0.0f;

  float dt          = SENSOR_SAMPLING_TIME;
  float addedEnergy = (p  / 3600.0f) * dt;
  float addedWater  = (wf / 1000.0f) * (dt / 60.0f);
  et += addedEnergy;
  wt += addedWater;

  float cost = (addedEnergy * energy_tariff) + (addedWater * water_tariff);
  balance -= cost;

  if (balance <= 0 && (rs == 1 || vs == 1)) {
    balance = 0; rs = 0; vs = 0;
    Serial.println("PEMUTUSAN LOKAL: Saldo mencapai 0.");
  }

  // --- Publish telemetry ---
  uint8_t frame[TELEMETRY_SIZE];
  buildTelemetry(frame, et, p, v, c, wf, wt, balance, rs, vs);

  String dataTopic = "device/" + String(device_id) + "/data";
  if (client.publish(dataTopic.c_str(), frame, TELEMETRY_SIZE)) {
    Serial.printf("[PUB] %dB | Rp:%.0f | %.1fW | %.2fLPM\n",
                  TELEMETRY_SIZE, balance, p, wf);
  } else {
    Serial.println("[PUB] Gagal — cek buffer size");
  }

  delay(SENSOR_SAMPLING_TIME * 1000);
}
