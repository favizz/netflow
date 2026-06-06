#ifndef SRUSUN_SDCARD_H
#define SRUSUN_SDCARD_H

#include <Arduino.h>
#include <SD.h>
#include <SPI.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <queue>

struct SensorSnap {
  float p   = 0; // W    (PZEM power × CAL_FACTOR_POWER)
  float v   = 0; // V    (PZEM voltage)
  float c   = 0; // A    (PZEM current)
  float wf  = 0; // L/min (flowmeter flowRate)
  float et  = 0; // kWh  (PZEM cumulative energy)
  float vol = 0; // L    (flowmeter cumulative volume)
};

// Shared device state — written by Core 0, read by Core 1
extern SensorSnap snap;
extern float electricBalance; // kWh token remaining
extern float waterBalance;    // m3 token remaining
extern uint32_t lastTopupTimestamp; // Unix seconds, rejects duplicate top-up frames
extern SemaphoreHandle_t balanceMutex;
extern SemaphoreHandle_t snapMutex;
extern int rs; // relay/SSR  : 1=ON  0=OFF
extern int vs; // servo valve: 1=OPEN 0=CLOSE

// SD backup queue
extern String backupFileName;
extern unsigned backupCount;
extern const unsigned BACKUP_QUEUE_LIMIT;
extern const unsigned BACKUP_COUNT_LIMIT;
extern std::queue<String> backupQueue;
extern bool sdOk;

// Configuration (loaded from /config.json by readConfig())
extern String wifiSSID;
extern String wifiPass;
extern String mqttServer;
extern int    mqttPort;
extern String deviceId;

// SD operations
bool initSD();
void readConfig();
void writeConfig();
void writeState();
void readState();
void deleteState();
void scanBackupFiles();

// te = electricity token remaining (kWh), tw = water token remaining (m³)
void appendBackup(const String& fname,
                  float et, float p, float v, float c,
                  float wf, float wt, float te, float tw, int rs_v, int vs_v);

// drainBackupFile lives in sRusun_wireless_handler (needs mqttClient + buildTelemetry)

#endif
