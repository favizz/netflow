#include "sRusun_wireless_handler.h"
#include "sRusun_SDCard.h"
#include "sRusun_Kwhmeter.h"
#include "sRusun_Flowmeter.h"
#include "SRusun_electricity_SSR.h"
#include "sRusun_servo_valve.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <time.h>
#include <sys/time.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPUpdate.h>

// =============================================================================
// LOCAL CONSTANTS
// =============================================================================
static const int   OTA_LED_PIN = 2;          // onboard LED (≠ SSR pin 27)
static const char* NTP_SERVER  = "id.pool.ntp.org";
static const long  GMT_OFFSET  = 7 * 3600;   // WIB UTC+7

// MQTT credentials — kept local so they never appear in main.cpp.
// Username MUST be this device's own device_id (the runtime `deviceId` read from
// SD config, e.g. "DEV-A-101"); the EMQX ACL grants each device access only to
// device/<device_id>/* topics. Password is the shared device secret, validated
// by the backend at POST /auth/mqtt (must equal MQTT_DEVICE_SECRET in the server .env).
static const char* MQTT_SECRET = "f7fde3a818e7a5a29fcc0d995330b025ae358a0f9381b401";

// Let's Encrypt ISRG Root X1 — verify against your broker's cert chain.
static const char* MQTT_CA_CERT = R"(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoBggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)";

// =============================================================================
// MODULE-LEVEL DEFINITIONS
// =============================================================================
volatile bool adminSSRLatch    = false;
uint8_t       SENSOR_SAMPLING_TIME = 5; // seconds between MQTT publishes

WiFiClientSecure espClient;
PubSubClient     mqttClient(espClient);

static bool     isNtpSynced        = false;

struct OtaArgs { uint8_t major, minor, patch; char url[512]; };
TaskHandle_t  otaTaskHandle = NULL;
unsigned long otaStartMs    = 0;
const unsigned long OTA_TIMEOUT_MS = 120000UL; // 2 min max

static uint32_t lastTopupTimestamp = 0;

// =============================================================================
// WiFi / MQTT SETUP HELPERS
// =============================================================================
void connectToWiFi()
{
  Serial.println("[WiFi] Connecting...");
  // Credentials loaded from /config.json by readConfig(); defaults are compiled in.
  WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000)
  {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED)
    Serial.println("\n[WiFi] " + WiFi.localIP().toString());
  else
    Serial.println("\n[WiFi] Not connected — SD offline mode active");
}

void initMQTT()
{
  espClient.setCACert(MQTT_CA_CERT); // verify broker TLS cert against ISRG Root X1
  mqttClient.setServer(mqttServer.c_str(), mqttPort);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1024); // headroom for OTA + telemetry
  mqttClient.setKeepAlive(30);
  mqttClient.setSocketTimeout(10);
}

// =============================================================================
// BINARY FRAME BUILDING — 25-byte TELEMETRY (matches backend binary-codec.ts)
// =============================================================================
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
static inline uint16_t clampU16(float v) {
  if (!isfinite(v) || v < 0) return 0;
  return (v > 65535.0f) ? 65535 : (uint16_t)(v + 0.5f);
}
static inline uint32_t clampU32(float v) {
  if (!isfinite(v) || v < 0) return 0;
  return (v > 4294967295.0f) ? 0xFFFFFFFFUL : (uint32_t)(v + 0.5f);
}

void buildTelemetry(uint8_t* buf,
                    float et, float p, float v, float c,
                    float wf, float wt, float te, float tw, int rs_v, int vs_v)
{
  writeU32BE(buf +  0, clampU32(et * 100));   // kWh × 100
  writeU16BE(buf +  4, clampU16(p  * 10));    // W × 10
  writeU16BE(buf +  6, clampU16(v  * 10));    // V × 10
  writeU16BE(buf +  8, clampU16(c  * 1000));  // A × 1000
  writeU16BE(buf + 10, clampU16(wf * 100));   // L/min × 100
  writeU32BE(buf + 12, clampU32(wt * 1000));  // m³ → L (× 1000)
  writeU32BE(buf + 16, clampU32(te * 1000));  // remaining elec kWh × 1000
  writeU32BE(buf + 20, clampU32(tw * 1000));  // remaining water m³ × 1000
  buf[24] = (rs_v & 1) | ((vs_v & 1) << 1);  // relay=bit0, valve=bit1
}

// =============================================================================
// NTP
// =============================================================================
void syncNTP()
{
  if (isNtpSynced || WiFi.status() != WL_CONNECTED) return;
  configTime(GMT_OFFSET, 0, NTP_SERVER);
  struct tm ti;
  int retry = 0;
  while (!getLocalTime(&ti) && retry++ < 15) delay(500);
  isNtpSynced = (retry < 15);
  if (isNtpSynced) Serial.println("[NTP] Synced");
}

// =============================================================================
// MQTT COMMAND HANDLERS
// =============================================================================
void handleCommand(uint8_t b)
{
  uint8_t type  = (b >> 4) & 0x0F;
  uint8_t value =  b       & 0x0F;
  const char* typeStr;

  if (type == 0x1) {
    typeStr = "relay";
    // Idempotent: only actuate on state change (retained msgs replay on reconnect)
    if (rs != (int)value) { rs = value; value ? SSROpen() : SSRClose(); }
    Serial.printf("[CMD] Relay → %s\n", rs ? "ON" : "OFF");
  } else if (type == 0x2) {
    typeStr = "valve";
    if (vs != (int)value) { vs = value; value ? ServoValveOpen() : ServoValveClose(); }
    Serial.printf("[CMD] Valve → %s\n", vs ? "OPEN" : "CLOSE");
  } else {
    Serial.printf("[CMD] Unknown type 0x%X\n", type);
    return;
  }

  char ackTopic[64], ackMsg[64];
  snprintf(ackTopic, sizeof(ackTopic), "device/%s/command_ack", deviceId.c_str());
  snprintf(ackMsg,   sizeof(ackMsg),
           "{\"status\":\"ok\",\"type\":\"%s\",\"value\":%d}", typeStr, value);
  mqttClient.publish(ackTopic, ackMsg);
}

void handleTopup(uint8_t* buf, unsigned int length)
{
  if (length != 12) { Serial.println("[TOPUP] Frame wrong size"); return; }
  uint32_t elecAmt  = ((uint32_t)buf[0]<<24)|((uint32_t)buf[1]<<16)|((uint32_t)buf[2]<<8)|buf[3];
  uint32_t waterAmt = ((uint32_t)buf[4]<<24)|((uint32_t)buf[5]<<16)|((uint32_t)buf[6]<<8)|buf[7];
  uint32_t ts       = ((uint32_t)buf[8]<<24)|((uint32_t)buf[9]<<16)|((uint32_t)buf[10]<<8)|buf[11];

  char ackMsg[128];
  if (ts <= lastTopupTimestamp && lastTopupTimestamp != 0) {
    Serial.printf("[TOPUP] Ignored duplicate ts=%u\n", ts);
    snprintf(ackMsg, sizeof(ackMsg),
             "{\"status\":\"ok\",\"elec\":%u,\"water\":%u,\"duplicate\":true}", elecAmt, waterAmt);
  } else {
    if (xSemaphoreTake(balanceMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      electricBalance += (float)elecAmt;
      waterBalance    += (float)waterAmt;
      xSemaphoreGive(balanceMutex);
    }
    lastTopupTimestamp = ts;
    Serial.printf("[TOPUP] elec=+Rp%u water=+Rp%u | elecBal=%.0f waterBal=%.0f | ts=%u\n",
                  elecAmt, waterAmt, electricBalance, waterBalance, ts);
    writeState();
    snprintf(ackMsg, sizeof(ackMsg),
             "{\"status\":\"ok\",\"elec\":%u,\"water\":%u}", elecAmt, waterAmt);
  }

  char ackTopic[64];
  snprintf(ackTopic, sizeof(ackTopic), "device/%s/topup_ack", deviceId.c_str());
  mqttClient.publish(ackTopic, ackMsg);
}

// Admin SSR latch — type 0x1 value 0x1 → latch ON; type 0x1 value 0x0 → latch OFF.
// volatile flag so Core 0 reads it immediately without a mutex.
void handleAdminCommand(uint8_t b)
{
  uint8_t type  = (b >> 4) & 0x0F;
  uint8_t value =  b       & 0x0F;
  if (type != 0x1) { Serial.printf("[ADMIN] Unknown type 0x%X\n", type); return; }
  adminSSRLatch = (value != 0);
  Serial.printf("[ADMIN] SSR latch → %s\n", adminSSRLatch ? "ON (override)" : "OFF (normal)");

  char ackTopic[64], ackMsg[64];
  snprintf(ackTopic, sizeof(ackTopic), "device/%s/admin_ack", deviceId.c_str());
  snprintf(ackMsg,   sizeof(ackMsg),
           "{\"status\":\"ok\",\"latch\":%s}", adminSSRLatch ? "true" : "false");
  mqttClient.publish(ackTopic, ackMsg);
}

void handleCalibration(uint8_t* buf)
{
  // [0:1] CALIBRATION_FACTOR×100  [2] CAL_FACTOR_POWER×100  [3] SENSOR_SAMPLING_TIME
  CALIBRATION_FACTOR   = ((buf[0] << 8) | buf[1]) / 100.0f;
  CAL_FACTOR_POWER     =  buf[2] / 100.0f;
  SENSOR_SAMPLING_TIME =  buf[3];
  Serial.printf("[CFG] cf=%.2f  cp=%.2f  st=%d\n",
                CALIBRATION_FACTOR, CAL_FACTOR_POWER, SENSOR_SAMPLING_TIME);
  char ackTopic[64];
  snprintf(ackTopic, sizeof(ackTopic), "device/%s/config_ack", deviceId.c_str());
  mqttClient.publish(ackTopic, "{\"status\":\"ok\"}");
}

void handleResetState()
{
  deleteState();
  Serial.println("[RESET] State reset to defaults");
  char ackTopic[64];
  snprintf(ackTopic, sizeof(ackTopic), "device/%s/reset_ack", deviceId.c_str());
  mqttClient.publish(ackTopic, "{\"status\":\"ok\",\"message\":\"State reset to defaults\"}");
}

// =============================================================================
// OTA — runs in a dedicated task so taskMQTT is never blocked
// =============================================================================
// otaTask: spawned by handleOta(); taskMQTT monitors it for OTA_TIMEOUT_MS.
// WiFiClientSecure.setTimeout(30) surfaces WiFi loss as HTTP error, not infinite block.
// rebootOnUpdate(false): reboot AFTER ACK so server sees success before device goes dark.
// Power-loss safety: Update.end() commits partition pointer only after MD5 verify;
// partial download leaves slot invalid → bootloader falls back to old firmware.
void otaTask(void* arg)
{
  OtaArgs* a = (OtaArgs*)arg;
  uint8_t major = a->major, minor = a->minor, patch = a->patch;
  char url[512];
  strlcpy(url, a->url, sizeof(url));
  free(a);

  WiFiClientSecure c;
  c.setInsecure();
  c.setTimeout(30);

  httpUpdate.rebootOnUpdate(false);
  httpUpdate.setLedPin(OTA_LED_PIN, LOW);
  t_httpUpdate_return ret = httpUpdate.update(c, url);

  char ackMsg[80];
  bool doReboot = false;
  switch (ret) {
    case HTTP_UPDATE_OK:
      snprintf(ackMsg, sizeof(ackMsg),
               "{\"status\":\"ok\",\"version\":\"%u.%u.%u\"}", major, minor, patch);
      doReboot = true;
      Serial.println("[OTA] Flash OK — MD5 verified, partition committed");
      break;
    case HTTP_UPDATE_NO_UPDATES:
      snprintf(ackMsg, sizeof(ackMsg), "{\"status\":\"noop\"}");
      Serial.println("[OTA] No update needed");
      break;
    default:
      snprintf(ackMsg, sizeof(ackMsg),
               "{\"status\":\"failed\",\"error\":%d}", httpUpdate.getLastError());
      Serial.printf("[OTA] Failed: %s\n", httpUpdate.getLastErrorString().c_str());
      break;
  }

  // Reconnect MQTT just long enough to deliver the ACK.
  char ackTopic[64];
  snprintf(ackTopic, sizeof(ackTopic), "device/%s/ota_ack", deviceId.c_str());
  if (mqttClient.connect(deviceId.c_str(), deviceId.c_str(), MQTT_SECRET)) {
    mqttClient.publish(ackTopic, ackMsg);
    mqttClient.loop();
    delay(500);
    mqttClient.disconnect();
    Serial.printf("[OTA] ACK sent: %s\n", ackMsg);
  }

  // Clear handle BEFORE self-delete so taskMQTT sees completion on next tick.
  otaTaskHandle = NULL;
  if (doReboot) { delay(200); ESP.restart(); }
  vTaskDelete(NULL);
}

void handleOta(byte* payload, unsigned int length)
{
  if (length < 5) { Serial.println("[OTA] Frame too short"); return; }
  if (!(payload[3] & 0x01)) { Serial.println("[OTA] update_now=0 — skipped"); return; }
  if (otaTaskHandle != NULL) {
    Serial.println("[OTA] Already in progress — ignoring duplicate frame");
    return;
  }

  uint8_t major = payload[0], minor = payload[1], patch = payload[2];
  char url[512] = {0};
  size_t urlLen = length - 4;
  if (urlLen == 0 || urlLen >= sizeof(url)) { Serial.println("[OTA] Bad URL"); return; }
  memcpy(url, payload + 4, urlLen);
  url[urlLen] = '\0';
  Serial.printf("[OTA] v%u.%u.%u → %s\n", major, minor, patch, url);

  OtaArgs* args = (OtaArgs*)malloc(sizeof(OtaArgs));
  if (!args) { Serial.println("[OTA] malloc failed"); return; }
  args->major = major; args->minor = minor; args->patch = patch;
  strlcpy(args->url, url, sizeof(args->url));

  // Disconnect before spawning so otaTask has exclusive access to mqttClient.
  mqttClient.disconnect();
  delay(200);
  otaStartMs = millis();
  // Priority 1 = same as taskMQTT; higher would starve the timeout watchdog.
  xTaskCreatePinnedToCore(otaTask, "OTA", 8192, args, 1, &otaTaskHandle, 1);
}

// =============================================================================
// MQTT CALLBACK & CONNECTION
// =============================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length)
{
  String t = String(topic);
  Serial.printf("[MQTT] ← %s (%u B)\n", topic, length);
  if      (t.endsWith("/command") && length == 1)  handleCommand(payload[0]);
  else if (t.endsWith("/topup")   && length == 12) handleTopup(payload, length);
  else if (t.endsWith("/config")  && length == 4)  handleCalibration(payload);
  else if (t.endsWith("/admin")   && length == 1)  handleAdminCommand(payload[0]);
  else if (t.endsWith("/reset")   && length == 0)  handleResetState();
  else if (t.endsWith("/ota"))                      handleOta(payload, length);
}

bool ensureMQTT()
{
  if (WiFi.status() != WL_CONNECTED) return false;
  if (mqttClient.connected()) return true;

  Serial.print("[MQTT] Connecting...");
  if (!mqttClient.connect(deviceId.c_str(), deviceId.c_str(), MQTT_SECRET)) {
    Serial.printf(" failed (state=%d)\n", mqttClient.state());
    return false;
  }
  Serial.println(" OK");
  String base = "device/" + deviceId;
  mqttClient.subscribe((base + "/command").c_str(), 1);
  mqttClient.subscribe((base + "/topup").c_str(),   1);
  mqttClient.subscribe((base + "/config").c_str(),  1);
  mqttClient.subscribe((base + "/admin").c_str(),   1);
  mqttClient.subscribe((base + "/reset").c_str(),   1);
  mqttClient.subscribe((base + "/ota").c_str(),     1);
  Serial.printf("[MQTT] Subscribed to %s/{command,topup,config,admin,reset,ota}\n", base.c_str());
  return true;
}

// =============================================================================
// PUBLISH & BACKUP DRAIN
// =============================================================================
bool publishFrame(const char* topic,
                  float et, float p, float v, float c,
                  float wf, float wt, float te, float tw, int rs_v, int vs_v)
{
  uint8_t frame[TELEMETRY_SIZE];
  buildTelemetry(frame, et, p, v, c, wf, wt, te, tw, rs_v, vs_v);
  for (int i = 0; i < 3; i++) {
    if (mqttClient.publish(topic, frame, TELEMETRY_SIZE)) return true;
    mqttClient.loop();
    delay(50);
  }
  return false;
}

// Read a backup file line-by-line and publish each row as a binary MQTT frame.
// Removes the file on success. Returns true when the entire file published.
bool drainBackupFile(const String& fname)
{
  if (!sdOk) return false;
  String path = "/backup/" + fname;
  if (!SD.exists(path.c_str())) return false;
  File f = SD.open(path.c_str(), FILE_READ);
  if (!f) { Serial.printf("[BATCH] Cannot open %s\n", path.c_str()); return false; }

  String dataTopic = "device/" + deviceId + "/data";
  bool allOk = true;

  while (f.available()) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;

    JsonDocument entry;
    if (deserializeJson(entry, line)) continue; // skip corrupt rows

    float et_v = entry["et"] | 0.0f;
    float p_v  = entry["p"]  | 0.0f;
    float v_v  = entry["v"]  | 0.0f;
    float c_v  = entry["c"]  | 0.0f;
    float wf_v = entry["wf"] | 0.0f;
    float wt_v = entry["wt"] | 0.0f;
    float te_v = entry["te"] | 0.0f;
    float tw_v = entry["tw"] | 0.0f;
    int   rs_v = entry["rs"] | 0;
    int   vs_v = entry["vs"] | 0;

    uint8_t frame[TELEMETRY_SIZE];
    buildTelemetry(frame, et_v, p_v, v_v, c_v, wf_v, wt_v, te_v, tw_v, rs_v, vs_v);

    bool sent = false;
    for (int i = 0; i < 3 && !sent; i++) {
      sent = mqttClient.publish(dataTopic.c_str(), frame, TELEMETRY_SIZE);
      if (!sent) { mqttClient.loop(); delay(50); }
    }
    if (!sent) { allOk = false; break; }
    mqttClient.loop();
    delay(20); // small gap between replayed frames
  }

  f.close();
  if (allOk) SD.remove(path.c_str());
  return allOk;
}
