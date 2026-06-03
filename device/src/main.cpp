// =============================================================================
// SRusun NetFlow — Production Firmware
//
// Architecture (FreeRTOS dual-core):
//   Core 0  taskSensorRead  — reads sensors every 1 s, ServoDebounce
//   Core 1  taskMQTT        — MQTT publish, offline batching, LCD, state save
//
// Offline batching (mirrors HTTP Reference batch.json logic):
//   • When MQTT is unreachable, readings are appended to an SD backup file
//     as newline-delimited JSON (NDJSON) — BACKUP_COUNT_LIMIT+1 rows per file.
//   • Up to BACKUP_QUEUE_LIMIT backup files are kept; oldest is dropped when full.
//   • On reconnect: publish live reading first, then drain one backup file
//     (each row → 25-byte binary frame to device/{id}/data).
//
// MQTT binary protocol (matches backend binary-codec.ts):
//   TELEMETRY  25 B  →  device/{id}/data
//   COMMAND     1 B  ←  device/{id}/command
//   TOPUP      12 B  ←  device/{id}/topup
//   CALIBRATION 4 B  ←  device/{id}/config
//   ADMIN       1 B  ←  device/{id}/admin
//   OTA  binary     ←  device/{id}/ota
//   ACKs JSON       →  device/{id}/command_ack | topup_ack | config_ack | admin_ack | ota_ack
// =============================================================================

#include <Arduino.h>
#include <SD.h>
#include <WiFi.h>
#include <time.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

#include "sRusun_Flowmeter.h"
#include "sRusun_Kwhmeter.h"
#include "sRusun_servo_valve.h"
#include "SRusun_electricity_SSR.h"
#include "sRusun_SDCard.h"
#include "sRusun_wireless_handler.h"
#include "SRusun_Display.h"

// Tariffs for per-second token decrement (Core 0).
// Updated live via MQTT CALIBRATION frame handled in sRusun_wireless_handler.
static const float RP_PER_KWH = 1450.0f; // Rp / kWh  (electricity)
static const float RP_PER_M3  = 5000.0f; // Rp / m³   (water)

// =============================================================================
// CORE 0 — taskSensorRead
// Reads hardware sensors every 1 s and updates the shared snapshot (snap).
// Runs independently so the MQTT publish interval does not affect sensor resolution.
// =============================================================================
static unsigned long lastSensorRead = 0;
static const unsigned long SENSOR_READ_INTERVAL = 1000; // ms — fixed

void taskSensorRead(void *param)
{
  while (true)
  {
    unsigned long now = millis();
    if (now - lastSensorRead >= SENSOR_READ_INTERVAL)
    {
      readFlowmeters(); // → flowRate (L/min), volume (L)
      readPZEM();       // → voltage, current, power, energy (kWh)
      ServoDebounce();  // hold servo angle after open/close command

      float localPower = 0.0f;
      float localFlow  = 0.0f;
      if (xSemaphoreTake(snapMutex, pdMS_TO_TICKS(5)) == pdTRUE)
      {
        snap.p   = power * CAL_FACTOR_POWER;
        snap.v   = voltage;
        snap.c   = current;
        snap.wf  = flowRate;
        snap.et  = energy;  // kWh from PZEM cumulative register
        snap.vol = volume;  // Litres from flowmeter pulse counter
        localPower = snap.p;
        localFlow  = snap.wf;
        xSemaphoreGive(snapMutex);
      }
      lastSensorRead += SENSOR_READ_INTERVAL;

      // ── Token decrement (every 1 s) ──────────────────────────────────────
      // elec cost  = power_W × 1 s × (Rp/kWh) / (1000 W/kW × 3600 s/h)
      // water cost = flow_L/min × (1 min/60 s) × (1 m³/1000 L) × (Rp/m³)
      float elecCost  = localPower * RP_PER_KWH / 3600000.0f;
      float waterCost = localFlow  * RP_PER_M3  / 60000.0f;
      bool elecOk  = false;
      bool waterOk = false;
      if (xSemaphoreTake(balanceMutex, pdMS_TO_TICKS(5)) == pdTRUE)
      {
        elecOk  = (electricBalance >= elecCost);
        waterOk = (waterBalance    >= waterCost);
        if (elecOk)  { electricBalance -= elecCost;  if (electricBalance < 0.0f) electricBalance = 0.0f; }
        if (waterOk) { waterBalance    -= waterCost; if (waterBalance    < 0.0f) waterBalance    = 0.0f; }
        xSemaphoreGive(balanceMutex);
      }

      // ── SSR enforcement ──────────────────────────────────────────────────
      // Token OK  → follow server command (rs).
      // Token low → normally OFF; adminSSRLatch keeps it ON.
      int effectiveSSR = elecOk ? rs : (adminSSRLatch ? 1 : 0);
      if      (effectiveSSR  && !SSR_state)        SSROpen();
      else if (!effectiveSSR &&  SSR_state)        SSRClose();

      // ── Valve enforcement ────────────────────────────────────────────────
      // Water token exhausted → close valve regardless of server command (vs).
      int effectiveValve = waterOk ? vs : 0;
      if      (effectiveValve  && !water_valve_state) ServoValveOpen();
      else if (!effectiveValve &&  water_valve_state) ServoValveClose();
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// =============================================================================
// CORE 1 — taskMQTT
// Manages WiFi/MQTT, publishes telemetry, cycles LCD, and handles SD batching.
// Mirrors the HTTP Reference taskDataWrite logic — only the transport changes.
// =============================================================================
void taskMQTT(void *param)
{
  const unsigned long STATE_WRITE_INTERVAL = 30000; // ms — mirrors HTTP ref
  const unsigned long LCD_CYCLE_INTERVAL   = 5000;  // ms — mirrors HTTP ref

  unsigned long lastStateWrite = 0;
  unsigned long lastLcdCycle   = 0;
  unsigned long lastPublish    = 0;

  scanBackupFiles(); // load existing SD backups into queue on boot

  while (true)
  {
    unsigned long now = millis();

    // ── OTA guard — block MQTT ops while OTA task is running ─────────────
    // otaTask owns mqttClient for the duration of the download + ACK.
    if (otaTaskHandle != NULL)
    {
      if (now - otaStartMs >= OTA_TIMEOUT_MS)
      {
        // WiFi drop or server stall — force-abort; old firmware boots on reset.
        Serial.println("[OTA] Timeout — force aborting, resuming normal operation");
        Update.abort();
        vTaskDelete(otaTaskHandle);
        otaTaskHandle = NULL;
      }
      else
      {
        if (now - lastLcdCycle >= LCD_CYCLE_INTERVAL)
        {
          unsigned long elapsed = (now - otaStartMs) / 1000;
          lcd.clear();
          lcd.setCursor(0, 0); lcd.print("Firmware Update");
          lcd.setCursor(0, 1); lcd.print("Wait "); lcd.print(elapsed); lcd.print("s...");
          lastLcdCycle = now;
        }
        vTaskDelay(pdMS_TO_TICKS(100));
        continue;
      }
    }

    // ── MQTT keepalive ───────────────────────────────────────────────────
    if (mqttClient.connected()) mqttClient.loop();

    // ── NTP sync (once after WiFi connects) ─────────────────────────────
    syncNTP();

    // ── LCD cycling every 5 s ────────────────────────────────────────────
    if (now - lastLcdCycle >= LCD_CYCLE_INTERVAL)
    {
      SensorSnap s;
      if (xSemaphoreTake(snapMutex, pdMS_TO_TICKS(10)) == pdTRUE) { s = snap; xSemaphoreGive(snapMutex); }
      updateLCD(s, s.vol / 1000.0f);
      lcdPage++;
      lastLcdCycle = now;
    }

    // ── State persistence every 30 s ─────────────────────────────────────
    if (now - lastStateWrite >= STATE_WRITE_INTERVAL)
    {
      writeState();
      lastStateWrite = now;
    }

    // ── Telemetry publish every SENSOR_SAMPLING_TIME s ───────────────────
    if (now - lastPublish >= (unsigned long)SENSOR_SAMPLING_TIME * 1000)
    {
      lastPublish = now;

      SensorSnap s;
      if (xSemaphoreTake(snapMutex, pdMS_TO_TICKS(20)) == pdTRUE) { s = snap; xSemaphoreGive(snapMutex); }
      float wt = s.vol / 1000.0f; // L → m³

      float elecTokenKwh, waterTokenM3;
      if (xSemaphoreTake(balanceMutex, pdMS_TO_TICKS(10)) == pdTRUE)
      {
        elecTokenKwh = electricBalance / RP_PER_KWH;
        waterTokenM3 = waterBalance    / RP_PER_M3;
        xSemaphoreGive(balanceMutex);
      }
      else
      {
        elecTokenKwh = electricBalance / RP_PER_KWH;
        waterTokenM3 = waterBalance    / RP_PER_M3;
      }

      String dataTopic = "device/" + deviceId + "/data";
      bool online = ensureMQTT();
      bool sent   = false;

      // ── ONLINE path ────────────────────────────────────────────────────
      if (online)
      {
        sent = publishFrame(dataTopic.c_str(),
                            s.et, s.p, s.v, s.c, s.wf, wt, elecTokenKwh, waterTokenM3, rs, vs);
        if (sent)
        {
          Serial.printf("[PUB] E:%.0f W:%.0f | P:%.1fW | V:%.1fV | WF:%.2fLPM | ET:%.2fkWh | WT:%.3fm3\n",
                        electricBalance, waterBalance, s.p, s.v, s.wf, s.et, wt);

          // Drain one backup file per successful publish (mirrors HTTP ref)
          if (!backupQueue.empty())
          {
            String fname = backupQueue.front();
            backupQueue.pop();
            Serial.println("[BATCH] Draining: " + fname);
            if (drainBackupFile(fname))
              Serial.println("[BATCH] Done: " + fname);
            else
            {
              backupQueue.push(fname); // partial failure — retry next cycle
              Serial.println("[BATCH] Incomplete — will retry: " + fname);
            }
          }

          backupCount    = 0;
          backupFileName = "";
        }
        else
        {
          Serial.println("[PUB] Failed after retries");
        }
      }

      // ── OFFLINE / send-failed path ─────────────────────────────────────
      if (!online || !sent)
      {
        if (sdOk)
        {
          if (backupCount == 0)
          {
            backupFileName = "bk_" + String((unsigned long)time(NULL));
            if (backupQueue.size() >= BACKUP_QUEUE_LIMIT)
            {
              String oldest = backupQueue.front();
              backupQueue.pop();
              SD.remove(("/backup/" + oldest).c_str());
              Serial.println("[SD] Queue full — dropped: " + oldest);
            }
            backupQueue.push(backupFileName);
            Serial.println("[SD] New backup: " + backupFileName);
          }

          appendBackup(backupFileName,
                       s.et, s.p, s.v, s.c, s.wf, wt, elecTokenKwh, waterTokenM3, rs, vs);
          backupCount++;
          Serial.printf("[SD] Offline backup (%u/%u) → %s\n",
                        backupCount, BACKUP_COUNT_LIMIT + 1, backupFileName.c_str());

          if (backupCount > BACKUP_COUNT_LIMIT)
            backupCount = 0;
        }
        else
        {
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
void setup()
{
  Serial.begin(115200);
  Serial.println("[Boot] SRusun NetFlow v2.0");

  // Hardware peripherals
  initSSR();
  initServoValve();
  initFlowmeter();
  initPZEM();
  initDisplay();

  // SD card: load config then restore saved state
  if (initSD())
  {
    readConfig();
    readState();
    vs ? ServoValveOpen() : ServoValveClose();
    rs ? SSROpen() : SSRClose();
    Serial.printf("[Boot] Actuators restored — relay=%s valve=%s\n",
                  rs ? "ON" : "OFF", vs ? "OPEN" : "CLOSE");
  }
  else
  {
    // No SD — safe defaults: both open
    SSROpen();
    ServoValveOpen();
  }

  Serial.printf("[Boot] DEVICE_ID=%s  SENSOR_SAMPLING_TIME=%ds\n",
                deviceId.c_str(), SENSOR_SAMPLING_TIME);

  // WiFi (blocking, 15 s timeout — mirrors HTTP ref connectToWiFi)
  connectToWiFi();

  if (WiFi.status() == WL_CONNECTED)
  {
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("WiFi OK");
    lcd.setCursor(0, 1); lcd.print(WiFi.localIP().toString());
    syncNTP();
  }
  else
  {
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("WiFi FAILED");
    lcd.setCursor(0, 1); lcd.print("Offline mode");
  }

  // MQTT client config (lazy connect inside taskMQTT via ensureMQTT)
  initMQTT();

  // Shared mutexes — must be created before tasks start
  snapMutex    = xSemaphoreCreateMutex();
  configASSERT(snapMutex);
  balanceMutex = xSemaphoreCreateMutex();
  configASSERT(balanceMutex);

  // Pin tasks to cores
  xTaskCreatePinnedToCore(taskSensorRead, "SensorRead", 4096, NULL, 1, NULL, 0);
  xTaskCreatePinnedToCore(taskMQTT,       "MQTT",       8192, NULL, 1, NULL, 1);

  Serial.println("[Boot] Tasks pinned — Core0=sensors  Core1=MQTT");
}

// All work is done in FreeRTOS tasks — loop() intentionally idle.
void loop()
{
  vTaskDelay(pdMS_TO_TICKS(1000));
}
