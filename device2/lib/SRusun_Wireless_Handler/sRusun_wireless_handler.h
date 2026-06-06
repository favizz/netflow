#ifndef SRUSUN_WIRELESS_HANDLER
#define SRUSUN_WIRELESS_HANDLER

#include <Arduino.h>
#include <ArduinoJson.h>
#include <time.h>
#include <sys/time.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPUpdate.h>

// ---------------------------------------------------------------------------
// Shared state — exported to main.cpp (Core 0 reads adminSSRLatch directly)
// ---------------------------------------------------------------------------
extern volatile bool adminSSRLatch;
extern uint8_t       SENSOR_SAMPLING_TIME;

// Shared balance state from sRusun_SDCard (also needed by wireless handlers)
extern float electricBalance;
extern float waterBalance;
extern SemaphoreHandle_t balanceMutex;

// ---------------------------------------------------------------------------
// MQTT client objects — defined in sRusun_wireless_handler.cpp
// ---------------------------------------------------------------------------
extern WiFiClientSecure espClient;
extern PubSubClient     mqttClient;

// ---------------------------------------------------------------------------
// OTA task state — defined in sRusun_wireless_handler.cpp
// ---------------------------------------------------------------------------
extern TaskHandle_t  otaTaskHandle;
extern unsigned long otaStartMs;
extern const unsigned long OTA_TIMEOUT_MS;

// ---------------------------------------------------------------------------
// MQTT binary protocol — 25-byte telemetry frame (binary-codec.ts)
//   [0-3]   et  × 100   U32BE  (kWh cumulative × 100)
//   [4-5]   p   × 10    U16BE  (W × 10)
//   [6-7]   v   × 10    U16BE  (V × 10)
//   [8-9]   c   × 1000  U16BE  (A × 1000)
//   [10-11] wf  × 100   U16BE  (L/min × 100)
//   [12-15] wt  × 1000  U32BE  (m³ × 1000 = L cumulative)
//   [16-19] te  × 1000  U32BE  (remaining electricity kWh × 1000)
//   [20-23] tw  × 1000  U32BE  (remaining water m³ × 1000)
//   [24]    status byte         (bit0=relay, bit1=valve)
// ---------------------------------------------------------------------------
static const int TELEMETRY_SIZE = 25;

void buildTelemetry(uint8_t* buf,
                    float et, float p, float v, float c,
                    float wf, float wt, float te, float tw, int rs_v, int vs_v);

bool publishFrame(const char* topic,
                  float et, float p, float v, float c,
                  float wf, float wt, float te, float tw, int rs_v, int vs_v);

bool drainBackupFile(const String& fname);

// ---------------------------------------------------------------------------
// WiFi / MQTT setup helpers — called from setup() in main.cpp
// ---------------------------------------------------------------------------
void connectToWiFi();
void initMQTT();

// ---------------------------------------------------------------------------
// MQTT handlers / runtime helpers
// ---------------------------------------------------------------------------
void syncNTP();
void handleCommand(uint8_t b);
void handleTopup(uint8_t* buf, unsigned int length);
void handleAdminCommand(uint8_t b);
void handleCalibration(uint8_t* buf);
void handleResetState();
void otaTask(void* arg);
void handleOta(byte* payload, unsigned int length);
void mqttCallback(char* topic, byte* payload, unsigned int length);
bool ensureMQTT();

#endif // SRUSUN_WIRELESS_HANDLER
