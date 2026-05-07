// =============================================================================
// SRusun NetFlow — Production Firmware
//
// Architecture (FreeRTOS dual-core, adapted from HTTP Reference):
//   Core 0  taskSensorRead  — reads sensors every 1 s, ServoDebounce
//   Core 1  taskMQTT        — MQTT publish, offline batching, LCD, state save
//
// Offline batching (mirrors HTTP Reference batch.json logic):
//   • When MQTT is unreachable, readings are appended to an SD backup file
//     as newline-delimited JSON (NDJSON) — BACKUP_COUNT_LIMIT+1 rows per file.
//   • Up to BACKUP_QUEUE_LIMIT backup files are kept; oldest is dropped when full.
//   • When MQTT reconnects: publish the current reading first, then drain one
//     backup file (publishing each row as a 21-byte binary frame to the same
//     device/{id}/data topic — no separate batch channel).
//
// MQTT binary protocol (matches backend binary-codec.ts):
//   TELEMETRY  21 B  →  device/{id}/data
//   COMMAND     1 B  ←  device/{id}/command
//   TOPUP       8 B  ←  device/{id}/topup       (payment-gateway token refill)
//   CALIBRATION 4 B  ←  device/{id}/config
//   ADMIN       1 B  ←  device/{id}/admin        (admin SSR latch override)
//   OTA  binary     ←  device/{id}/ota
//   ACKs JSON       →  device/{id}/command_ack | topup_ack | config_ack | admin_ack | ota_ack
// =============================================================================

#include <Arduino.h>
#include <SD.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPUpdate.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>
#include <time.h>
#include <sys/time.h>
#include <queue>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

#include "sRusun_Flowmeter.h"
#include "sRusun_Kwhmeter.h"
#include "sRusun_servo_valve.h"
#include "SRusun_electricity_SSR.h"

// =============================================================================
// HARDWARE PINS
// =============================================================================
// Flowmeter  GPIO 25  (PCNT_UNIT_0)   — sRusun_Flowmeter.cpp
// PZEM       RX=16  TX=17            — sRusun_Kwhmeter.cpp  (Serial2)
// Servo      GPIO 26                  — sRusun_servo_valve.cpp
// SSR/Relay  GPIO 27                  — SRusun_electricity_SSR.cpp
// SD card    CS=14  (SPI default)
// LCD        I²C 0x27, 16×2

const int SD_CS_PIN   = 14;
const int OTA_LED_PIN = 2;   // onboard LED, safe (≠ SSR pin 27)

// =============================================================================
// CONFIGURATION
// =============================================================================
const char* WIFI_SSID    = "Nevatron";
const char* WIFI_PASS    = "Nevatron!2024Ok";
const char* MQTT_SERVER  = "broker.emqx.io";
const int   MQTT_PORT    = 8883;           // TLS
const char* MQTT_SECRET  = "";
const char* DEVICE_ID    = "DEV-A-101";   // must match units.device_id in DB

// Electricity tariff used for per-second token decrement in Core 0
static const float RP_PER_KWH = 1450.0f;  // Rp / kWh

// =============================================================================
// CALIBRATION — updated live via MQTT config frame
// CALIBRATION_FACTOR (pulses/s per L/min) lives in sRusun_Flowmeter.cpp
// =============================================================================
uint8_t SENSOR_SAMPLING_TIME = 5;      // seconds between MQTT publishes

// =============================================================================
// DEVICE STATE
// =============================================================================
float balance = 999999.0f;  // Rp — high initial so device doesn't cut off
                             // before backend syncs the real value
int rs = 1;  // relay/SSR  : 1=ON   0=OFF
int vs = 1;  // servo valve: 1=OPEN 0=CLOSE

// Admin SSR latch — set by Core 1 MQTT handler, read by Core 0 every 1 s.
// When true: SSR stays ON even if token balance is insufficient.
volatile bool adminSSRLatch = false;

// Protects balance across Core 0 (decrement) and Core 1 (topup, state save).
static SemaphoreHandle_t balanceMutex = NULL;

// =============================================================================
// SENSOR SNAPSHOT
// Core 0 writes; Core 1 reads. Protected by snapMutex.
// =============================================================================
struct SensorSnap {
  float p   = 0;  // W    (PZEM power × CAL_FACTOR_POWER)
  float v   = 0;  // V    (PZEM voltage)
  float c   = 0;  // A    (PZEM current)
  float wf  = 0;  // L/min (flowmeter flowRate)
  float et  = 0;  // kWh  (PZEM cumulative energy register)
  float vol = 0;  // L    (flowmeter cumulative volume)
};
static SensorSnap snap;
static SemaphoreHandle_t snapMutex = NULL;

// =============================================================================
// PERIPHERALS
// =============================================================================
LiquidCrystal_I2C lcd(0x27, 16, 2);

WiFiClientSecure espClient;
PubSubClient     mqttClient(espClient);

bool sdOk        = false;
bool isNtpSynced = false;

const char* NTP_SERVER   = "id.pool.ntp.org";
const long  GMT_OFFSET   = 7 * 3600;  // WIB UTC+7

// =============================================================================
// BATCHING CONSTANTS  (mirrors HTTP Reference task logic)
// =============================================================================
// Each backup file accumulates BACKUP_COUNT_LIMIT+1 readings before rotating.
// Up to BACKUP_QUEUE_LIMIT files are kept on SD (oldest dropped when full).
static const unsigned BACKUP_QUEUE_LIMIT = 15;
static const unsigned BACKUP_COUNT_LIMIT = 2;   // → 3 rows per file @ 5s = 15s

static std::queue<String> backupQueue;
static unsigned backupCount    = 0;
static String   backupFileName = "";

// =============================================================================
// BINARY PROTOCOL  (binary-codec.ts — must stay in sync)
// =============================================================================
#define TELEMETRY_SIZE 21

static inline void writeU16BE(uint8_t* buf, uint16_t val) {
  buf[0] = (val >> 8) & 0xFF;  buf[1] = val & 0xFF;
}
static inline void writeU32BE(uint8_t* buf, uint32_t val) {
  buf[0] = (val >> 24) & 0xFF; buf[1] = (val >> 16) & 0xFF;
  buf[2] = (val >>  8) & 0xFF; buf[3] =  val        & 0xFF;
}

void buildTelemetry(uint8_t* buf,
                    float et, float p, float v, float c,
                    float wf, float wt, float b, int rs_v, int vs_v) {
  writeU32BE(buf +  0, (uint32_t)(et * 100  + 0.5f));
  writeU16BE(buf +  4, (uint16_t)(p  * 10   + 0.5f));
  writeU16BE(buf +  6, (uint16_t)(v  * 10   + 0.5f));
  writeU16BE(buf +  8, (uint16_t)(c  * 1000 + 0.5f));
  writeU16BE(buf + 10, (uint16_t)(wf * 100  + 0.5f));
  writeU32BE(buf + 12, (uint32_t)(wt * 1000 + 0.5f));
  writeU32BE(buf + 16, (uint32_t)(b         + 0.5f));
  buf[20] = (rs_v & 1) | ((vs_v & 1) << 1);
}

// =============================================================================
// SD CARD — state.json + backup NDJSON
// =============================================================================

bool initSD() {
  sdOk = SD.begin(SD_CS_PIN);
  if (!sdOk) { Serial.println("[SD] Init failed — offline log disabled"); return false; }
  if (!SD.exists("/backup")) SD.mkdir("/backup");
  Serial.println("[SD] Ready");
  return true;
}

// Persist device state every 30 s so a reboot restores volume and valve state.
void writeState() {
  if (!sdOk) return;
  if (SD.exists("/state.json")) SD.remove("/state.json");
  File f = SD.open("/state.json", FILE_WRITE);
  if (!f) { Serial.println("[SD] Cannot write state.json"); return; }

  SensorSnap s;
  if (xSemaphoreTake(snapMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
    s = snap;
    xSemaphoreGive(snapMutex);
  }

  float savedBalance;
  if (xSemaphoreTake(balanceMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
    savedBalance = balance;
    xSemaphoreGive(balanceMutex);
  } else {
    savedBalance = balance;
  }

  JsonDocument doc;
  doc["ts"]      = (long)time(NULL);
  doc["vs"]      = (bool)vs;
  doc["rs"]      = (bool)rs;
  doc["vol_L"]   = s.vol;    // flowmeter cumulative volume in Litres
  doc["et_kWh"]  = s.et;     // PZEM cumulative energy (persists in PZEM EEPROM too)
  doc["balance"] = savedBalance;

  serializeJson(doc, f);
  f.flush();
  f.close();
  Serial.println("[SD] State saved");
}

// Restore state on boot — restores valve/relay state and flowmeter volume.
void readState() {
  if (!sdOk || !SD.exists("/state.json")) {
    Serial.println("[SD] No state.json — defaults");
    return;
  }
  File f = SD.open("/state.json", FILE_READ);
  if (!f) return;

  JsonDocument doc;
  if (deserializeJson(doc, f)) { f.close(); Serial.println("[SD] state.json corrupt"); return; }
  f.close();

  vs      = doc["vs"]      | 1;
  rs      = doc["rs"]      | 1;
  balance = doc["balance"] | 999999.0f;

  float savedVol = doc["vol_L"] | 0.0f;
  // Re-seed the pulse counter so readFlowmeters() continues from the saved volume.
  // Formula from sRusun_Flowmeter.cpp: volume = pulseCount / CALIBRATION_FACTOR / 60
  pulseCount = (int64_t)(savedVol * CALIBRATION_FACTOR * 60.0f);

  Serial.printf("[SD] Restored — vs=%d rs=%d vol=%.2fL bal=%.0f\n",
                vs, rs, savedVol, balance);
}

// ── Backup helpers ────────────────────────────────────────────────────────────

// Scan existing backup files into the queue on boot (mirrors HTTP Reference).
void scanBackupFiles() {
  if (!sdOk) return;
  File root = SD.open("/backup");
  if (!root) return;
  File f;
  while ((f = root.openNextFile())) {
    if (!f.isDirectory()) {
      String name = String(f.name());
      // SD library may return full path (/backup/foo) or just filename
      int slash = name.lastIndexOf('/');
      if (slash >= 0) name = name.substring(slash + 1);
      if (name.length() > 0) {
        backupQueue.push(name);
        Serial.println("[SD] Queued backup: " + name);
      }
    }
    f.close();
  }
  root.close();
  Serial.printf("[SD] %u backup file(s) found\n", (unsigned)backupQueue.size());
}

// Append one sensor reading to a backup file as a single JSON line (NDJSON).
void appendBackup(const String& fname,
                  float et, float p, float v, float c,
                  float wf, float wt, float b, int rs_v, int vs_v) {
  if (!sdOk) return;
  File f = SD.open(("/backup/" + fname).c_str(), FILE_APPEND);
  if (!f) { Serial.println("[SD] Cannot append backup"); return; }

  JsonDocument entry;
  entry["ts"]  = (long)time(NULL);
  entry["et"]  = et;
  entry["p"]   = p;
  entry["v"]   = v;
  entry["c"]   = c;
  entry["wf"]  = wf;
  entry["wt"]  = wt;
  entry["b"]   = (long)b;
  entry["rs"]  = rs_v;
  entry["vs"]  = vs_v;

  serializeJson(entry, f);
  f.print('\n');
  f.flush();
  f.close();
}

// Read a backup file line-by-line and publish each row as a binary MQTT frame
// to the same device/{id}/data topic used for live telemetry.
// Returns true when the entire file published successfully (caller deletes it).
bool drainBackupFile(const String& fname) {
  if (!sdOk) return false;
  String path = "/backup/" + fname;
  File f = SD.open(path.c_str(), FILE_READ);
  if (!f) { Serial.printf("[BATCH] Cannot open %s\n", path.c_str()); return false; }

  String dataTopic = "device/" + String(DEVICE_ID) + "/data";
  bool allOk = true;

  while (f.available()) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;

    JsonDocument entry;
    if (deserializeJson(entry, line)) continue;  // skip corrupt rows

    float et_v  = entry["et"]  | 0.0f;
    float p_v   = entry["p"]   | 0.0f;
    float v_v   = entry["v"]   | 0.0f;
    float c_v   = entry["c"]   | 0.0f;
    float wf_v  = entry["wf"]  | 0.0f;
    float wt_v  = entry["wt"]  | 0.0f;
    float b_v   = entry["b"]   | 0.0f;
    int   rs_v  = entry["rs"]  | 0;
    int   vs_v  = entry["vs"]  | 0;

    uint8_t frame[TELEMETRY_SIZE];
    buildTelemetry(frame, et_v, p_v, v_v, c_v, wf_v, wt_v, b_v, rs_v, vs_v);

    bool sent = false;
    for (int i = 0; i < 3 && !sent; i++) {
      sent = mqttClient.publish(dataTopic.c_str(), frame, TELEMETRY_SIZE);
      if (!sent) { mqttClient.loop(); delay(50); }
    }
    if (!sent) { allOk = false; break; }
    mqttClient.loop();
    delay(20);  // small gap between replayed frames
  }

  f.close();
  return allOk;
}

// =============================================================================
// NTP
// =============================================================================
void syncNTP() {
  if (isNtpSynced || WiFi.status() != WL_CONNECTED) return;
  configTime(GMT_OFFSET, 0, NTP_SERVER);
  struct tm ti;
  int retry = 0;
  while (!getLocalTime(&ti) && retry++ < 15) delay(500);
  isNtpSynced = (retry < 15);
  if (isNtpSynced) Serial.println("[NTP] Synced");
}

// =============================================================================
// MQTT — command / calibration / OTA handlers
// =============================================================================

void handleCommand(uint8_t b) {
  uint8_t type  = (b >> 4) & 0x0F;
  uint8_t value =  b       & 0x0F;
  const char* typeStr;

  if (type == 0x1) {
    typeStr = "relay";
    rs = value;
    value ? SSROpen() : SSRClose();
    Serial.printf("[CMD] Relay → %s\n", rs ? "ON" : "OFF");
  } else if (type == 0x2) {
    typeStr = "valve";
    vs = value;
    value ? ServoValveOpen() : ServoValveClose();
    Serial.printf("[CMD] Valve → %s\n", vs ? "OPEN" : "CLOSE");
  } else {
    Serial.printf("[CMD] Unknown type 0x%X\n", type);
    return;
  }

  char ackTopic[64], ackMsg[64];
  snprintf(ackTopic, sizeof(ackTopic), "device/%s/command_ack", DEVICE_ID);
  snprintf(ackMsg,  sizeof(ackMsg),
           "{\"status\":\"ok\",\"type\":\"%s\",\"value\":%d}", typeStr, value);
  mqttClient.publish(ackTopic, ackMsg);
}

static uint32_t lastTopupTimestamp = 0;

void handleTopup(uint8_t* buf, unsigned int length) {
  if (length != 8) { Serial.println("[TOPUP] Frame wrong size"); return; }
  uint32_t amount = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
  uint32_t ts     = (buf[4] << 24) | (buf[5] << 16) | (buf[6] << 8) | buf[7];

  char ackMsg[128];
  if (ts <= lastTopupTimestamp && lastTopupTimestamp != 0) {
    Serial.printf("[TOPUP] Ignored duplicate ts=%u\n", ts);
    snprintf(ackMsg, sizeof(ackMsg), "{\"status\":\"ok\",\"amount\":%u,\"duplicate\":true}", amount);
  } else {
    if (xSemaphoreTake(balanceMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      balance += amount;
      xSemaphoreGive(balanceMutex);
    }
    lastTopupTimestamp = ts;
    Serial.printf("[TOPUP] Added Rp %u | New Balance: Rp %.0f | ts: %u\n", amount, balance, ts);
    writeState();
    snprintf(ackMsg, sizeof(ackMsg), "{\"status\":\"ok\",\"amount\":%u}", amount);
  }

  char ackTopic[64];
  snprintf(ackTopic, sizeof(ackTopic), "device/%s/topup_ack", DEVICE_ID);
  mqttClient.publish(ackTopic, ackMsg);
}

// Admin SSR latch command — 1-byte frame, same encoding as handleCommand.
// type 0x1 + value 0x1 → latch ON (SSR forced ON even with zero balance).
// type 0x1 + value 0x0 → latch OFF (return to normal token-based control).
// Flag is global volatile so Core 0 reads it immediately without a mutex.
void handleAdminCommand(uint8_t b) {
  uint8_t type  = (b >> 4) & 0x0F;
  uint8_t value =  b       & 0x0F;
  if (type != 0x1) {
    Serial.printf("[ADMIN] Unknown type 0x%X\n", type);
    return;
  }
  adminSSRLatch = (value != 0);
  Serial.printf("[ADMIN] SSR latch → %s\n", adminSSRLatch ? "ON (override)" : "OFF (normal)");

  char ackTopic[64], ackMsg[64];
  snprintf(ackTopic, sizeof(ackTopic), "device/%s/admin_ack", DEVICE_ID);
  snprintf(ackMsg,  sizeof(ackMsg),
           "{\"status\":\"ok\",\"latch\":%s}", adminSSRLatch ? "true" : "false");
  mqttClient.publish(ackTopic, ackMsg);
}

void handleCalibration(uint8_t* buf) {
  // [0:1] CALIBRATION_FACTOR×100  [2] CAL_FACTOR_POWER×100  [3] SENSOR_SAMPLING_TIME
  CALIBRATION_FACTOR   = ((buf[0] << 8) | buf[1]) / 100.0f;
  CAL_FACTOR_POWER     =  buf[2] / 100.0f;
  SENSOR_SAMPLING_TIME =  buf[3];
  Serial.printf("[CFG] cf=%.2f  cp=%.2f  st=%d\n",
                CALIBRATION_FACTOR, CAL_FACTOR_POWER, SENSOR_SAMPLING_TIME);

  char ackTopic[64];
  snprintf(ackTopic, sizeof(ackTopic), "device/%s/config_ack", DEVICE_ID);
  mqttClient.publish(ackTopic, "{\"status\":\"ok\"}");
}

void handleOta(byte* payload, unsigned int length) {
  if (length < 5) { Serial.println("[OTA] Frame too short"); return; }
  if (!(payload[3] & 0x01)) { Serial.println("[OTA] update_now=0 — skipped"); return; }

  uint8_t major = payload[0], minor = payload[1], patch = payload[2];
  char url[512] = {0};
  size_t urlLen = length - 4;
  if (urlLen == 0 || urlLen >= sizeof(url)) { Serial.println("[OTA] Bad URL"); return; }
  memcpy(url, payload + 4, urlLen);
  url[urlLen] = '\0';

  Serial.printf("[OTA] v%u.%u.%u → %s\n", major, minor, patch, url);

  // Disconnect MQTT before large TLS download to free heap
  mqttClient.disconnect();
  delay(200);

  WiFiClientSecure otaClient;
  otaClient.setInsecure();
  otaClient.setTimeout(30);

  httpUpdate.rebootOnUpdate(false);  // Manual reboot — send ACK first
  httpUpdate.setLedPin(OTA_LED_PIN, LOW);
  t_httpUpdate_return ret = httpUpdate.update(otaClient, url);

  char ackMsg[80];
  bool doReboot = false;
  switch (ret) {
    case HTTP_UPDATE_OK:
      snprintf(ackMsg, sizeof(ackMsg),
               "{\"status\":\"ok\",\"version\":\"%u.%u.%u\"}", major, minor, patch);
      doReboot = true;
      Serial.println("[OTA] Flash OK");
      break;
    case HTTP_UPDATE_NO_UPDATES:
      snprintf(ackMsg, sizeof(ackMsg), "{\"status\":\"noop\"}");
      Serial.println("[OTA] No update");
      break;
    default:
      snprintf(ackMsg, sizeof(ackMsg),
               "{\"status\":\"failed\",\"error\":%d}", httpUpdate.getLastError());
      Serial.printf("[OTA] Failed: %s\n", httpUpdate.getLastErrorString().c_str());
      break;
  }

  // Reconnect just to send ACK, then reboot
  char ackTopic[64];
  snprintf(ackTopic, sizeof(ackTopic), "device/%s/ota_ack", DEVICE_ID);
  if (mqttClient.connect(DEVICE_ID, DEVICE_ID, MQTT_SECRET)) {
    mqttClient.publish(ackTopic, ackMsg);
    mqttClient.loop();
    delay(500);
    mqttClient.disconnect();
    Serial.printf("[OTA] ACK sent: %s\n", ackMsg);
  }

  if (doReboot) { delay(200); ESP.restart(); }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String t = String(topic);
  Serial.printf("[MQTT] ← %s (%u B)\n", topic, length);
  if      (t.endsWith("/command") && length == 1) handleCommand(payload[0]);
  else if (t.endsWith("/topup")   && length == 8) handleTopup(payload, length);
  else if (t.endsWith("/config")  && length == 4) handleCalibration(payload);
  else if (t.endsWith("/admin")   && length == 1) handleAdminCommand(payload[0]);
  else if (t.endsWith("/ota"))                    handleOta(payload, length);
}

// =============================================================================
// CORE 0  — taskSensorRead
// Reads hardware sensors every 1 s and updates the shared snapshot.
// Runs independently so the publish interval does not affect sensor resolution.
// =============================================================================

static unsigned long lastSensorRead = 0;
const unsigned long  SENSOR_READ_INTERVAL = 1000;  // ms — fixed

void taskSensorRead(void* param) {
  while (true) {
    unsigned long now = millis();
    if (now - lastSensorRead >= SENSOR_READ_INTERVAL) {
      readFlowmeters();  // → flowRate (L/min), volume (L)
      readPZEM();        // → voltage, current, power, energy (kWh)
      ServoDebounce();   // hold servo angle after open/close command

      // Update snapshot for Core 1; capture calibrated power for decrement below
      float localPower = 0.0f;
      if (xSemaphoreTake(snapMutex, pdMS_TO_TICKS(5)) == pdTRUE) {
        snap.p   = power   * CAL_FACTOR_POWER;
        snap.v   = voltage;
        snap.c   = current;
        snap.wf  = flowRate;
        snap.et  = energy;   // kWh from PZEM cumulative register
        snap.vol = volume;   // Litres from flowmeter pulse counter
        localPower = snap.p;
        xSemaphoreGive(snapMutex);
      }
      lastSensorRead += SENSOR_READ_INTERVAL;

      // ── Token decrement (every 1 s) ────────────────────────────────────────
      // cost = power_W * 1 s * (1450 Rp/kWh) / (1000 W/kW * 3600 s/h)
      float costPerSecond = localPower * RP_PER_KWH / 3600000.0f;
      bool tokenSufficient = false;
      if (xSemaphoreTake(balanceMutex, pdMS_TO_TICKS(5)) == pdTRUE) {
        tokenSufficient = (balance >= costPerSecond);
        if (tokenSufficient) {
          balance -= costPerSecond;
          if (balance < 0.0f) balance = 0.0f;
        }
        xSemaphoreGive(balanceMutex);
      }

      // ── SSR enforcement ────────────────────────────────────────────────────
      // Token OK  → follow server command (rs).
      // Token low → normally OFF; admin latch keeps it ON.
      int effectiveSSR = tokenSufficient ? rs : (adminSSRLatch ? 1 : 0);
      if      ( effectiveSSR && !SSR_state) SSROpen();
      else if (!effectiveSSR &&  SSR_state) SSRClose();
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// =============================================================================
// CORE 1  — taskMQTT
// Manages WiFi/MQTT, publishes telemetry, LCD cycling, and SD batching.
// Mirrors the HTTP Reference taskDataWrite logic — only the transport changes.
// =============================================================================

// Returns true when MQTT is ready (connects if needed, subscribes on first connect).
bool ensureMQTT() {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (mqttClient.connected()) return true;

  Serial.print("[MQTT] Connecting...");
  if (!mqttClient.connect(DEVICE_ID, DEVICE_ID, MQTT_SECRET)) {
    Serial.printf(" failed (state=%d)\n", mqttClient.state());
    return false;
  }
  Serial.println(" OK");
  String base = "device/" + String(DEVICE_ID);
  mqttClient.subscribe((base + "/command").c_str(), 1);
  mqttClient.subscribe((base + "/topup").c_str(),   1);
  mqttClient.subscribe((base + "/config").c_str(),  1);
  mqttClient.subscribe((base + "/admin").c_str(),   1);
  mqttClient.subscribe((base + "/ota").c_str(),     1);
  Serial.printf("[MQTT] Subscribed to %s/{command,topup,config,admin,ota}\n", base.c_str());
  return true;
}

// Publish one binary frame with up to 3 retries.
bool publishFrame(const char* topic, float et, float p, float v, float c,
                  float wf, float wt, float b, int rs_v, int vs_v) {
  uint8_t frame[TELEMETRY_SIZE];
  buildTelemetry(frame, et, p, v, c, wf, wt, b, rs_v, vs_v);
  for (int i = 0; i < 3; i++) {
    if (mqttClient.publish(topic, frame, TELEMETRY_SIZE)) return true;
    mqttClient.loop();
    delay(50);
  }
  return false;
}

static int lcdPage = 0;
const int  LCD_PAGES = 3;

void updateLCD(const SensorSnap& s, float wt) {
  lcd.clear();
  switch (lcdPage % LCD_PAGES) {
    case 0:  // Balance + relay/valve state
      lcd.setCursor(0, 0);
      lcd.print("Rp:"); lcd.print((long)balance);
      lcd.setCursor(0, 1);
      lcd.print(rs ? "Relay:ON " : "Relay:OFF");
      lcd.print(vs ? " V:O" : " V:C");
      break;
    case 1:  // Power + flowrate
      lcd.setCursor(0, 0);
      lcd.print("P:"); lcd.print(s.p, 0); lcd.print("W ");
      lcd.print("V:"); lcd.print(s.v, 0); lcd.print("V");
      lcd.setCursor(0, 1);
      lcd.print("F:"); lcd.print(s.wf, 1); lcd.print("L/m   ");
      break;
    case 2:  // Cumulative totals
      lcd.setCursor(0, 0);
      lcd.print("E:"); lcd.print(s.et, 2); lcd.print("kWh");
      lcd.setCursor(0, 1);
      lcd.print("W:"); lcd.print(wt, 3);  lcd.print("m3 ");
      break;
  }
}

void taskMQTT(void* param) {
  const unsigned long STATE_WRITE_INTERVAL = 30000;  // ms — mirrors HTTP ref
  const unsigned long LCD_CYCLE_INTERVAL   =  5000;  // ms — mirrors HTTP ref

  unsigned long lastStateWrite = 0;
  unsigned long lastLcdCycle   = 0;
  unsigned long lastPublish    = 0;

  scanBackupFiles();  // Load existing SD backups into queue on boot

  while (true) {
    unsigned long now = millis();

    // ── MQTT keepalive ─────────────────────────────────────────────────────
    if (mqttClient.connected()) mqttClient.loop();

    // ── NTP sync (once after WiFi connects) ────────────────────────────────
    syncNTP();

    // ── LCD cycling (every 5 s — mirrors HTTP ref displayTime) ─────────────
    if (now - lastLcdCycle >= LCD_CYCLE_INTERVAL) {
      SensorSnap s;
      if (xSemaphoreTake(snapMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
        s = snap;
        xSemaphoreGive(snapMutex);
      }
      updateLCD(s, s.vol / 1000.0f);
      lcdPage++;
      lastLcdCycle = now;
    }

    // ── State persistence (every 30 s — mirrors HTTP ref stateWriteInterval) ─
    if (now - lastStateWrite >= STATE_WRITE_INTERVAL) {
      writeState();
      lastStateWrite = now;
    }

    // ── Telemetry publish (every SENSOR_SAMPLING_TIME s) ───────────────────
    if (now - lastPublish >= (unsigned long)SENSOR_SAMPLING_TIME * 1000) {
      lastPublish = now;

      // Consistent snapshot
      SensorSnap s;
      if (xSemaphoreTake(snapMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        s = snap;
        xSemaphoreGive(snapMutex);
      }
      float wt = s.vol / 1000.0f;  // L → m³

      // Balance deduction and SSR cutoff are handled by Core 0 (every 1 s).
      String dataTopic = "device/" + String(DEVICE_ID) + "/data";

      bool online = ensureMQTT();
      bool sent   = false;

      // ── ONLINE path ──────────────────────────────────────────────────────
      if (online) {
        sent = publishFrame(dataTopic.c_str(),
                            s.et, s.p, s.v, s.c, s.wf, wt, balance, rs, vs);
        if (sent) {
          Serial.printf("[PUB] Rp:%.0f | P:%.1fW | V:%.1fV | WF:%.2fLPM | ET:%.2fkWh | WT:%.3fm3\n",
                        balance, s.p, s.v, s.wf, s.et, wt);

          // Drain one backup file per successful publish — same channel, binary
          // format (mirrors HTTP ref "ONLY attempt batch send if sendData succeeded")
          if (!backupQueue.empty()) {
            String fname = backupQueue.front();
            backupQueue.pop();
            Serial.println("[BATCH] Draining: " + fname);

            if (drainBackupFile(fname)) {
              SD.remove(("/backup/" + fname).c_str());
              Serial.println("[BATCH] Done: " + fname);
            } else {
              // Partial failure — push to back, retry on next connected cycle
              backupQueue.push(fname);
              Serial.println("[BATCH] Incomplete — will retry: " + fname);
            }
          }

          // Reset offline accumulation state after a successful live send
          backupCount    = 0;
          backupFileName = "";

        } else {
          Serial.println("[PUB] Failed after retries");
        }
      }

      // ── OFFLINE / send-failed path ───────────────────────────────────────
      // Mirrors HTTP ref: save to SD when network unavailable OR sendData failed
      if (!online || !sent) {
        if (sdOk) {
          if (backupCount == 0) {
            // Start a new backup file (mirrors HTTP ref: backupFileName on backupCount==0)
            backupFileName = "bk_" + String((unsigned long)time(NULL));

            if (backupQueue.size() >= BACKUP_QUEUE_LIMIT) {
              // Drop oldest to make room (mirrors HTTP ref queue full logic)
              String oldest = backupQueue.front();
              backupQueue.pop();
              SD.remove(("/backup/" + oldest).c_str());
              Serial.println("[SD] Queue full — dropped: " + oldest);
            }
            backupQueue.push(backupFileName);
            Serial.println("[SD] New backup: " + backupFileName);
          }

          appendBackup(backupFileName,
                       s.et, s.p, s.v, s.c, s.wf, wt, balance, rs, vs);
          backupCount++;
          Serial.printf("[SD] Offline backup (%u/%u) → %s\n",
                        backupCount, BACKUP_COUNT_LIMIT + 1, backupFileName.c_str());

          // Rotate to a new file after BACKUP_COUNT_LIMIT+1 entries
          if (backupCount > BACKUP_COUNT_LIMIT) backupCount = 0;
        } else {
          Serial.println("[WARN] No SD — offline data lost");
        }
      }
    }

    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

// =============================================================================
// SETUP
// =============================================================================

void setup() {
  Serial.begin(115200);
  Serial.println("[Boot] SRusun NetFlow v2.0");

  // Hardware init
  initSSR();
  initServoValve();
  initFlowmeter();
  initPZEM();

  // LCD
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); lcd.print("SRusun NetFlow");
  lcd.setCursor(0, 1); lcd.print("Starting...");

  // SD + state restore (mirrors HTTP ref: initSD → readConfig → readState)
  if (initSD()) {
    readState();
    // Restore actuator state to match what was saved
    vs ? ServoValveOpen() : ServoValveClose();
    rs ? SSROpen()        : SSRClose();
    Serial.printf("[Boot] Actuators restored — relay=%s valve=%s\n",
                  rs ? "ON" : "OFF", vs ? "OPEN" : "CLOSE");
  } else {
    // No SD — safe defaults: both open
    SSROpen();
    ServoValveOpen();
  }

  Serial.printf("[Boot] DEVICE_ID=%s  SENSOR_SAMPLING_TIME=%ds\n",
                DEVICE_ID, SENSOR_SAMPLING_TIME);

  // WiFi (mirrors HTTP ref connectToWiFi — blocking with timeout)
  Serial.println("[WiFi] Connecting...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(500); Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] " + WiFi.localIP().toString());
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("WiFi OK");
    lcd.setCursor(0, 1); lcd.print(WiFi.localIP().toString());
    syncNTP();
  } else {
    Serial.println("\n[WiFi] Not connected — SD offline mode active");
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("WiFi FAILED");
    lcd.setCursor(0, 1); lcd.print("Offline mode");
  }

  // MQTT client config (connection done lazily inside taskMQTT)
  espClient.setInsecure();          // Dev/staging — swap for setCACert() in production
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1024);   // headroom for OTA + telemetry
  mqttClient.setKeepAlive(30);
  mqttClient.setSocketTimeout(10);

  // Shared mutexes
  snapMutex    = xSemaphoreCreateMutex();  configASSERT(snapMutex);
  balanceMutex = xSemaphoreCreateMutex();  configASSERT(balanceMutex);

  // Pin tasks to cores (mirrors HTTP Reference xTaskCreatePinnedToCore calls)
  xTaskCreatePinnedToCore(taskSensorRead, "SensorRead",  4096, NULL, 1, NULL, 0);
  xTaskCreatePinnedToCore(taskMQTT,       "MQTT",        8192, NULL, 1, NULL, 1);

  Serial.println("[Boot] Tasks pinned — Core0=sensors  Core1=MQTT");
}

// All work is done in FreeRTOS tasks — loop() intentionally idle.
void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}
