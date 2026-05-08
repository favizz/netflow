#ifndef SRUSUN_BASE_FUNCTION_H
#define SRUSUN_BASE_FUNCTION_H

#include <Arduino.h>
#include <SD.h>
#include <WiFi.h>
#include <LiquidCrystal_I2C.h>
#include <time.h>
#include <sys/time.h>
#include <ArduinoJson.h>

// 1. Declare external variables so other files can access them
extern int kCsSdPin;
extern bool isNtpSynced;
extern bool enableLogging;

extern String deviceSerialNumber;
extern String deviceMacAddress;
extern String wifiSSID;
extern String wifiPasskey;
extern String url_config;
extern String url_auth;
extern String url_data;
extern String url_batch;
extern time_t timestamp;
extern time_t last_saved_timestamp;
extern LiquidCrystal_I2C lcd;

// 2. Declare your functions
bool initSD();
void readConfig(bool logger);
void writeConfig(bool logger);
void readState(bool logger);
void writeState(bool logger);
void connectToWiFi(bool logger);
bool collectRTCData();
bool connectToNTP(bool logger);
void syncTime(bool logger);
void logMsg(const String& title, const String& message, bool enable);
void initHardware();

#endif // SRUSUN_BASE_FUNCTION_H