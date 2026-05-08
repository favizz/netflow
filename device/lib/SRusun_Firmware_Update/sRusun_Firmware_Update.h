#ifndef SRUSUN_FIRMWARE_UPDATE_H
#define SRUSUN_FIRMWARE_UPDATE_H

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <WiFiClientSecure.h>

extern String firmware_url;
extern String curr_version;
extern String recieve_version;
extern bool is_updating;
extern String whenToUpdate;
extern struct tm timeinfo;

void performOTA();

#endif