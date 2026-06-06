#include "sRusun_SDCard.h"
#include "sRusun_Flowmeter.h"
#include "sRusun_Kwhmeter.h"

#include <Arduino.h>
#include <SD.h>
#include <SPI.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <queue>

// =============================================================================
// BACKUP LIMITS
// =============================================================================
const unsigned BACKUP_QUEUE_LIMIT = 15;
const unsigned BACKUP_COUNT_LIMIT = 2; // → 3 rows per file @ 5 s = 15 s

std::queue<String> backupQueue;
unsigned backupCount    = 0;
String   backupFileName = "";

// =============================================================================
// SHARED DEVICE STATE — written Core 0, read Core 1, protected by mutexes
// =============================================================================
static const float LEGACY_RP_PER_KWH = 1450.0f;
static const float LEGACY_RP_PER_M3  = 5000.0f;

float electricBalance = 0.0f; // kWh token remaining
float waterBalance    = 0.0f; // m3 token remaining
uint32_t lastTopupTimestamp = 0;
SensorSnap snap;
SemaphoreHandle_t balanceMutex = NULL;
SemaphoreHandle_t snapMutex    = NULL;

int rs = 1; // relay/SSR  : 1=ON   0=OFF
int vs = 1; // servo valve: 1=OPEN 0=CLOSE

// =============================================================================
// HARDWARE
// =============================================================================
static const int SD_CS_PIN = 14;
bool sdOk = false;

// =============================================================================
// CONFIGURATION — loaded from /config.json; defaults match production values
// =============================================================================
String wifiSSID   = "Nevatron";
String wifiPass   = "Nevatron!2024Ok";
String mqttServer = "ta252601002.srusun.id";
int    mqttPort   = 8883;
String deviceId   = "DEV-A-101";

// =============================================================================
// SD INIT
// =============================================================================
bool initSD()
{
  sdOk = SD.begin(SD_CS_PIN, SPI, 4000000U);
  if (!sdOk) { Serial.println("[SD] Init failed — offline log disabled"); return false; }
  if (!SD.exists("/backup")) SD.mkdir("/backup");
  Serial.println("[SD] Ready");
  return true;
}

// =============================================================================
// CONFIG — /config.json
// =============================================================================
void readConfig()
{
  if (!sdOk || !SD.exists("/config.json")) {
    Serial.println("[SD] No config.json — using defaults");
    return;
  }
  File f = SD.open("/config.json", FILE_READ);
  if (!f) return;

  JsonDocument doc;
  if (deserializeJson(doc, f)) { f.close(); Serial.println("[SD] config.json corrupt"); return; }
  f.close();

  wifiSSID   = doc["wifi_ssid"]   | "Nevatron";
  wifiPass   = doc["wifi_pass"]   | "Nevatron!2024Ok";
  mqttServer = doc["mqtt_server"] | "ta252601002.srusun.id";
  mqttPort   = doc["mqtt_port"]   | 8883;
  deviceId   = doc["device_id"]   | "DEV-A-101";

  Serial.printf("[SD] Config restored — WiFi:%s MQTT:%s:%d Device:%s\n",
                wifiSSID.c_str(), mqttServer.c_str(), mqttPort, deviceId.c_str());
}

void writeConfig()
{
  if (!sdOk) return;
  if (SD.exists("/config.json")) SD.remove("/config.json");
  File f = SD.open("/config.json", FILE_WRITE);
  if (!f) { Serial.println("[SD] Cannot write config.json"); return; }

  JsonDocument doc;
  doc["wifi_ssid"]   = wifiSSID;
  doc["wifi_pass"]   = wifiPass;
  doc["mqtt_server"] = mqttServer;
  doc["mqtt_port"]   = mqttPort;
  doc["device_id"]   = deviceId;

  serializeJson(doc, f);
  f.flush();
  f.close();
  Serial.println("[SD] Config saved");
}

// =============================================================================
// STATE — /state.json  (balances + actuator state + flowmeter volume)
// =============================================================================
void writeState()
{
  if (!sdOk) return;
  if (SD.exists("/state.json")) SD.remove("/state.json");
  File f = SD.open("/state.json", FILE_WRITE);
  if (!f) { Serial.println("[SD] Cannot write state.json"); return; }

  SensorSnap s;
  if (xSemaphoreTake(snapMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
    s = snap;
    xSemaphoreGive(snapMutex);
  }

  float savedElec, savedWater;
  if (xSemaphoreTake(balanceMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
    savedElec  = electricBalance;
    savedWater = waterBalance;
    xSemaphoreGive(balanceMutex);
  } else {
    savedElec  = electricBalance;
    savedWater = waterBalance;
  }

  JsonDocument doc;
  doc["ts"]        = (long)time(NULL);
  doc["vs"]        = (bool)vs;
  doc["rs"]        = (bool)rs;
  doc["vol_L"]     = s.vol;
  doc["et_kWh"]    = s.et;
  doc["elec_token_kwh"] = savedElec;
  doc["water_token_m3"] = savedWater;
  doc["last_topup_ts"] = lastTopupTimestamp;

  serializeJson(doc, f);
  f.flush();
  f.close();
  Serial.println("[SD] State saved");
}

void readState()
{
  if (!sdOk || !SD.exists("/state.json")) {
    Serial.println("[SD] No state.json — defaults");
    return;
  }
  File f = SD.open("/state.json", FILE_READ);
  if (!f) return;

  JsonDocument doc;
  if (deserializeJson(doc, f)) { f.close(); Serial.println("[SD] state.json corrupt"); return; }
  f.close();

  vs              = doc["vs"]        | 1;
  rs              = doc["rs"]        | 1;
  if (doc["elec_token_kwh"].is<float>()) {
    electricBalance = doc["elec_token_kwh"] | 0.0f;
  } else {
    electricBalance = (doc["elec_bal"] | 0.0f) / LEGACY_RP_PER_KWH;
  }
  if (doc["water_token_m3"].is<float>()) {
    waterBalance = doc["water_token_m3"] | 0.0f;
  } else {
    waterBalance = (doc["water_bal"] | 0.0f) / LEGACY_RP_PER_M3;
  }
  lastTopupTimestamp = doc["last_topup_ts"] | 0;

  float savedVol = doc["vol_L"] | 0.0f;
  pulseCount = (int64_t)(savedVol * CALIBRATION_FACTOR * 60.0f);

  Serial.printf("[SD] Restored — vs=%d rs=%d vol=%.2fL elec=%.0f water=%.0f\n",
                vs, rs, savedVol, electricBalance, waterBalance);
}

void deleteState()
{
  if (!sdOk) return;
  if (SD.exists("/state.json")) {
    SD.remove("/state.json");
    Serial.println("[SD] state.json deleted");
  }
  electricBalance = 0.0f;
  waterBalance    = 0.0f;
  lastTopupTimestamp = 0;
  rs = 1;
  vs = 1;
  Serial.println("[SD] State reset to defaults");
}

// =============================================================================
// BACKUP — /backup/<fname>  (NDJSON, one reading per line)
// =============================================================================
void scanBackupFiles()
{
  if (!sdOk) return;
  File root = SD.open("/backup");
  if (!root) return;
  File f;
  while ((f = root.openNextFile())) {
    if (!f.isDirectory()) {
      String name = String(f.name());
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

// te = remaining electricity token (kWh), tw = remaining water token (m³)
void appendBackup(const String& fname,
                  float et, float p, float v, float c,
                  float wf, float wt, float te, float tw, int rs_v, int vs_v)
{
  if (!sdOk) return;
  File f = SD.open(("/backup/" + fname).c_str(), FILE_APPEND);
  if (!f) { Serial.println("[SD] Cannot append backup"); return; }

  JsonDocument entry;
  entry["ts"] = (long)time(NULL);
  entry["et"] = et;
  entry["p"]  = p;
  entry["v"]  = v;
  entry["c"]  = c;
  entry["wf"] = wf;
  entry["wt"] = wt;
  entry["te"] = te;
  entry["tw"] = tw;
  entry["rs"] = rs_v;
  entry["vs"] = vs_v;

  serializeJson(entry, f);
  f.print('\n');
  f.flush();
  f.close();
}
