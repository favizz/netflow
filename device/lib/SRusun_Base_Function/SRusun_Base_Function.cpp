#include <Arduino.h>
#include <SD.h>
#include <WiFi.h>
#include <LiquidCrystal_I2C.h>
#include <time.h>
#include <sys/time.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <PZEM004Tv30.h>
#include <stdint.h>
#include "driver/pcnt.h"

#include "sRusun_Base_Function.h"
#include "sRusun_Flowmeter.h"
#include "sRusun_Kwhmeter.h"
#include "sRusun_servo_valve.h"
#include "sRusun_Display.h"
#include "SRusun_electricity_SSR.h"

// 1. Define global variables (memory allocation)
int kCsSdPin = 14;
String deviceSerialNumber;
String deviceMacAddress;
String wifiSSID;
String wifiPasskey;
String url_config;
String url_auth;
String url_data;
String url_batch;

time_t timestamp;
time_t last_saved_timestamp;
bool isNtpSynced = false;
bool enableLogging = true;

LiquidCrystal_I2C lcd(0x27, 16, 2);

// 2. Implement functions
bool initSD() 
{
  pinMode(kCsSdPin, OUTPUT);
  digitalWrite(kCsSdPin, LOW);
  bool isSDReady = SD.begin(kCsSdPin, SPI, 400000);
  digitalWrite(kCsSdPin, HIGH);
  return isSDReady;
}

void logMsg(const String& title, const String& message, bool enable) 
{
  if (enable) {
    // Note: Ensure logMsg is not also defined in sRusun_Logger.cpp to avoid multiple definition errors.
    Serial.println("["+ String(timestamp)+ "] " + title + ": "+message + "\n");
  }
}

void writeConfig(bool logger)
{
  StaticJsonDocument<256> doc;

  doc["device_serial_number"] = "DEVICE-TESTER";
  doc["device_mac_address"] = "AA:AA:AA:AA:AA:AD";
  doc["wifi_ssid"] = "Nevatron";
  doc["wifi_passkey"] = "Nevatron!2024Ok";
  doc["url_config"] = "https://sbd.srusun.id/v1/configuration";
  doc["url_auth"] = "https://sbd.srusun.id/v1/auth";
  doc["url_data"] = "https://sbd.srusun.id/v1/receive";
  doc["url_batch"] = "https://sbd.srusun.id/v1/batch";

  if(SD.exists("/config.json")) 
  {
    SD.remove("/config.json");
    logMsg("WriteConfig", "Existing config.json removed.", logger);
  }

  File file = SD.open("/config.json", FILE_WRITE);

  if (!file) 
  {
    logMsg("WriteConfig", "Failed to open config.json for writing!", enableLogging);
    return;
  }

  serializeJson(doc, file);
  file.flush();  // Force write to SD card
  file.close();
  vTaskDelay(10 / portTICK_PERIOD_MS);  // Give SD time to finalize write
  
  if (logger) 
  {
    logMsg("WriteConfig", "Successfully wrote to config.json", logger);
    logMsg("WriteConfig", "Success...", logger);
    logMsg("WriteConfig", "closed", logger);
    logMsg("ReadConfig", "Configuration loaded:", logger);
    String jsonBody;
    serializeJsonPretty(doc, jsonBody);
    logMsg("WriteConfig", jsonBody, logger);
  }
}

void readConfig(bool logger)
{
  File file = SD.open("/config.json", FILE_READ);
  if (!file) {
    logMsg("ReadConfig", "Failed to open config.json!", enableLogging);
    return;
  }

  StaticJsonDocument<256> doc;

  DeserializationError error = deserializeJson(doc, file);
  if (error) 
  {
    logMsg("ReadConfig", "Failed to parse config.json: " + String(error.c_str()), enableLogging);
    file.close();
    return;
  }

  deviceSerialNumber = doc["device_serial_number"].as<String>();
  deviceMacAddress = doc["device_mac_address"].as<String>();
  wifiSSID = doc["wifi_ssid"].as<String>();
  wifiPasskey = doc["wifi_passkey"].as<String>();
  url_config = doc["url_config"].as<String>();
  url_auth = doc["url_auth"].as<String>();
  url_data = doc["url_data"].as<String>();
  url_batch = doc["url_batch"].as<String>();

  if (logger) 
  {
    String jsonBody;
    serializeJsonPretty(doc, jsonBody);
    logMsg("ReadConfig", "Configuration loaded: " + jsonBody, logger);
  }

  file.close();
}

//============ setup state.json

void readState(bool logger)
{
  if(!SD.exists("/state.json")) 
  {
    if (logger)
    {
      logMsg("ReadState", "state.json not found!", logger);
      logMsg("ReadState", "Initializing first time state...", logger);
    }
    water_valve_state = false;
    volume = 0.0;
    energy = 0.0;
    return;
  }

  File file = SD.open("/state.json", FILE_READ);
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, file);

  if (error) 
  {
    logMsg("ReadState", "Failed to parse state.json: " + String(error.c_str()), enableLogging);
    file.close();
    return;
  }

  last_saved_timestamp = doc["last_saved_timestamp"].as<time_t>();
  water_valve_state = doc["water_valve_state"].as<bool>();
  SSR_state = doc["ssr_state"].as<bool>();
  volume = doc["water_flowmeter_volume"].as<float>();
  energy = doc["electricity_energy"].as<float>();

  pulseCount = int64_t(volume * 60.0 * CALIBRATION_FACTOR);

  if (logger) 
  {
    String jsonBody;
    serializeJsonPretty(doc, jsonBody);
    logMsg("ReadState", "Success... " + jsonBody, logger);
  }
  
  file.close();
  logMsg("ReadState", "closed", logger);
}

void writeState(bool logger)
{
  StaticJsonDocument<256> doc;

  doc["last_saved_timestamp"] = time(NULL); 
  doc["water_valve_state"] = water_valve_state;
  doc["ssr_state"] = SSR_state;
  doc["water_flowmeter_volume"] = volume;
  doc["electricity_energy"] = energy;

  if(SD.exists("/state.json")) 
  {
    SD.remove("/state.json");
    logMsg("WriteState", "Existing state.json removed.", logger);
  }

  File file = SD.open("/state.json", FILE_WRITE);

  if (!file) 
  {
    logMsg("WriteState", "Failed to open state.json for writing!", enableLogging);
    return;
  }

  serializeJson(doc, file);
  file.flush();  
  file.close();
  vTaskDelay(10 / portTICK_PERIOD_MS);  
  
  if (logger) 
  {
    String jsonBody;
    serializeJsonPretty(doc, jsonBody);
    logMsg("WriteState", "Successfully wrote to state.json. Success... closed. " + jsonBody, logger);
  }
}

void connectToWiFi(bool logger)
{
  int retryCount = 0;
  const int maxRetries = 20;

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi...");
  
  if (logger)
  {
    logMsg("WiFi", "Connecting to WiFi...", logger);
    logMsg("WiFi", "SSID: " + wifiSSID, logger);
    logMsg("WiFi", "Passkey: " + wifiPasskey, logger);
  }
  
  WiFi.begin(wifiSSID.c_str(), wifiPasskey.c_str());
  while (WiFi.status() != WL_CONNECTED && retryCount < maxRetries)
  {
    logMsg("WiFi", "Connection attempt " + String(retryCount + 1) + " failed. Retrying...", logger);
    retryCount++;
    vTaskDelay(1000 / portTICK_PERIOD_MS);  
  }

  lcd.clear();
  lcd.setCursor(0, 0);

  if (WiFi.status() == WL_CONNECTED) 
  {
    lcd.print("WiFi Connected");
    if(logger)
    { 
      logMsg("WiFi", "WiFi Connected", logger);
      logMsg("WiFi", "IP Address: " + WiFi.localIP().toString(), logger);
    }
  } 
  else 
  {
    lcd.print("WiFi Connection Failed");
    if(logger)
    {
      logMsg("WiFi", "WiFi Connection Failed!", logger);
    }
  }
}

const char* ntpServer = "id.pool.ntp.org";
const long gmtOffset_sec = 7 * 3600; 
const int daylightOffset_sec = 0;    

struct tm timeinfo;

bool collectRTCData() 
{
  return getLocalTime(&timeinfo);
}

bool connectToNTP(bool logger)
{
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  
  if (logger)
  {
    logMsg("NTP", "Syncing time with NTP...", logger);
  }

  int retry = 0;
  while (!collectRTCData() && retry < 15) 
  { 
    logMsg("NTP", "Retry " + String(retry), logger);
    vTaskDelay(500 / portTICK_PERIOD_MS);
    retry++;
  }
  return retry < 15; 
}

void syncTime(bool logger)
{
  if (WiFi.status() == WL_CONNECTED && !isNtpSynced)
  {
    isNtpSynced = connectToNTP(logger);
  }

  time_t currentRTC = time(NULL);
  
  if (!isNtpSynced && currentRTC < 1609459200) 
  {
    struct timeval tv;
    tv.tv_sec = last_saved_timestamp; 
    tv.tv_usec = 0;
    settimeofday(&tv, NULL); 

    if (logger)
    {
      logMsg("SyncTime", "NTP sync failed, RTC set to last saved timestamp: " + String(last_saved_timestamp), logger);
    }
  }

  timestamp = time(NULL); 
  getLocalTime(&timeinfo); 

  if (logger)
  {
    char timeStr[64];
    strftime(timeStr, sizeof(timeStr), "%Y-%m-%d %H:%M:%S", &timeinfo);
    logMsg("SyncTime", "Time synced: " + String(timeStr), logger);
    logMsg("SyncTime", "Epoch (milliseconds): " + String(((uint64_t)timestamp) * 1000), logger);
  } 
}
