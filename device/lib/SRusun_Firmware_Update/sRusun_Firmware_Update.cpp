#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <WiFiClientSecure.h>

#include "sRusun_Firmware_Update.h"
#include "SRusun_Base_Function.h"

String firmware_url = "https://raw.githubusercontent.com/MedikaSurya/ESP32_Firmware_OTA_Update/main/.pio/build/denky32/firmware.bin";
String curr_version = "1.0.0";
String recieve_version = "";
String whenToUpdate = "now";
bool is_updating = false;

void performOTA() 
{
  
  logMsg("PerformOTA()", "Starting OTA Update from url: " + firmware_url + " with version: " + recieve_version, enableLogging);

  WiFiClientSecure client;
  // Setting insecure skips SSL certificate validation. 
  // For production, you should provide the GitHub Root CA certificate instead.
  client.setInsecure(); 

  HTTPClient http;
  http.begin(client, firmware_url);

  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) 
  {
    int contentLength = http.getSize();
    logMsg("PerformOTA()", "Firmware size: " + String(contentLength) + " bytes", enableLogging);

    // Check if there is enough space to begin OTA
    bool canBegin = Update.begin(contentLength);
    if (canBegin) 
    {
      logMsg("PerformOTA()", "Writing firmware to ESP32...", enableLogging);
      size_t written = Update.writeStream(http.getStream());

      if (written == contentLength) 
      {
        logMsg("PerformOTA()", "Written successfully!", enableLogging);
        if (Update.end()) 
        {
          logMsg("PerformOTA()", "OTA Complete. Restarting...", enableLogging);
          curr_version = recieve_version; // Update current version to the new version
          is_updating = false; // Reset updating flag
          
          ESP.restart(); // Restart into the new firmware


        } else 
        {
          logMsg("PerformOTA()", "OTA End Failed: " + String(Update.errorString()), enableLogging);
        }

      }

      else 
      {
        logMsg("PerformOTA()", "Written bytes do not match content length.", enableLogging);
      }
    }

    else 
    {
      logMsg("PerformOTA()", "Not enough space to begin OTA.", enableLogging);
    }
  }
   
  else 
  {
    logMsg("PerformOTA()", "HTTP GET failed, error code: " + String(httpCode), enableLogging);
  }
  http.end();
}
