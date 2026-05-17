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

#include "SRusun_Base_Function.h"
#include "SRusun_Data_Handler.h"
#include "sRusun_Flowmeter.h"
#include "sRusun_Kwhmeter.h"
#include "sRusun_servo_valve.h"
#include "SRusun_Display.h"
#include "SRusun_electricity_SSR.h"
#include "sRusun_Firmware_Update.h"

//========================== Read Sensor Functions (Modular)
unsigned long now = 0;
unsigned long printTime = 0;

// Configurable sampling intervals (in milliseconds)
const unsigned long SampleInterval = 1000;   // Read flowmeter every 1 second

unsigned long lastRead = 0;

// Task for Core 0: Read sensors ONLY (NO LCD to prevent timing issues)
void taskSensorRead(void* param) 
{
  while (true) 
  {
    now = millis();
    
    if (now - lastRead >= SampleInterval) 
    {
      readFlowmeters();
      readPZEM();
      //showData();
      ServoDebounce(); // Apply servo debounce
      lastRead = lastRead + SampleInterval;
    }
    
    vTaskDelay(10 / portTICK_PERIOD_MS); // Small delay to prevent watchdog reset
  }
}

#include <queue>

int lastAPIResponse = 0;
int lastAuthResponse = 0;
int lastSendResponse = 0;

void taskDataWrite(void* param) 
{
  unsigned BACKUP_QUENE_LIMIT = 15; // Maximum number of backup files in the queue
  unsigned BACKUP_COUNT_LIMIT = 2; // Number of backups to save before showing backup

  unsigned long lastStateWrite = 0;
  unsigned long lastDataSend = 0;
  const unsigned long stateWriteInterval = 30000; // 30 seconds
  const unsigned long dataSendInterval = 5000; // 5 seconds
  unsigned backupCount = 0;
  String backupFileName;
  std::queue<String> backupFileNameQueue = std::queue<String>(); // Queue to manage backup file names
  
  //Read Backup Folder to check for backup File
  if(!SD.exists("/backup"))
  {
    SD.mkdir("/backup");
  }
  logMsg("taskDataWrite()", "SD backup directory ready.", enableLogging);

  logMsg("taskDataWrite()", "1. Scanning for existing backup files in /backup directory...", enableLogging);
  
  File root = SD.open("/backup");

  logMsg("taskDataWrite()", "2. Existing backup files will be added to the queue for sending...", enableLogging);
  File file;
  while (file = root.openNextFile())
  {
    logMsg("taskDataWrite()", "3. Existing backup file found: " + String(file.name()), enableLogging);
    backupFileNameQueue.push(file.name());
  }
  int displayTime = 5000;
  while (true) 
  {
    unsigned long nowTask = millis();
    
    // Write state every 30 seconds

    if (nowTask - printTime >= displayTime) 
    {
      lcdShowData();
      selectedDisplay++;
      printTime += displayTime;
    }


    if (nowTask - lastStateWrite >= stateWriteInterval) 
    {
      syncTime(false);

      //Jika berhasil terhubung ke WiFi
      if (WiFi.status() == WL_CONNECTED)
      {
        logMsg("taskDataWrite()","last API Response: " + String(lastAPIResponse), enableLogging);
        logMsg("taskDataWrite()","last Auth Response: " + String(lastAuthResponse), enableLogging);
        if (lastAPIResponse != 200 || lastAuthResponse != 200)
        {
          int apiCode = getAPIKey(false); // Call once and store the result
          lastAPIResponse = apiCode;
          if (apiCode == 200)
          {
            logMsg("taskDataWrite()", "API key retrieved.", enableLogging);

            int authCode = authDevice(false); // Call once and store the result
            lastAuthResponse = authCode;
            if(authCode == 200)
            {
              logMsg("taskDataWrite()", "Auth Successfully.", enableLogging);
            }
            else
            {
              logMsg("taskDataWrite()", "Auth failed with code: " + String(authCode), enableLogging); // FIXED
            }
            
          }
          else
          {
            logMsg("taskDataWrite()", "Failed to get API key with code: " + String(apiCode), enableLogging); // FIXED
          }
        }

        
      }
      
      writeState(false);
      lastStateWrite = nowTask;
    }
    
    // Send data every 5 seconds
    if (nowTask - lastDataSend >= dataSendInterval) 
    {
      syncTime(false);

      StaticJsonDocument<1024> doc = composeData(false);

      if (WiFi.status() == WL_CONNECTED && lastAPIResponse == 200 && lastAuthResponse == 200) 
      { 
        lastSendResponse = sendData(doc, false);
        
        if (lastSendResponse != 200)
        {
          // Token expired or network dropped. Invalidate Auth so it retries on the next tick.
          lastAuthResponse = lastSendResponse;
          logMsg("taskDataWrite()", "sendData failed with " + String(lastSendResponse) + ". Aborting batch send for this cycle.", enableLogging);
        }

        else 
        {
          //Check OTA Update
          if (is_updating == true)
          {
            //Check when to update
            if (whenToUpdate == "now")
            {
              logMsg("taskDataWrite()", "Initiating OTA Update as per schedule.", enableLogging);
              performOTA(); //Will Restart ESP32 if OTA is successful, so no need to handle post-OTA logic here.
            }
            else if (whenToUpdate == "tonight")
            {
              logMsg("taskDataWrite()", "OTA Update scheduled for tonight.", enableLogging);

              // Implement logic to check if it's midnight (00.00)
              time_t currentTime = time(NULL);
              struct tm *localTime = localtime(&currentTime);
              int hour = localTime->tm_hour;
              int minute = localTime->tm_min;

              if (hour == 0 && minute == 0)
              {
                logMsg("taskDataWrite()", "It's nighttime. Initiating OTA Update.", enableLogging);
                performOTA(); //Will Restart ESP32 if OTA is successful, so no need to handle post-OTA logic here.
              } 
              else 
              {
                logMsg("taskDataWrite()", "Not nighttime yet. OTA Update will be attempted later.", enableLogging);
              }
            }
          }

          logMsg("taskDataWrite()", "Data sent to server.", enableLogging);

          // ONLY attempt batch send if the primary sendData succeeded!
          logMsg("taskDataWrite()", "1. Checking for backup files to send...", enableLogging);
          if (!backupFileNameQueue.empty()) 
          {
            logMsg("taskDataWrite()", "2. Network available. Attempting to send backup files in batch...", enableLogging);
            
            String batchFileName = backupFileNameQueue.front();
            logMsg("taskDataWrite()", "3. Batch file to send: " + batchFileName, enableLogging);

            backupFileNameQueue.pop();

            String batchData = composeBatchData(batchFileName, false);
            
            if (sendBatch(batchData, false) == 200) 
            {
              logMsg("taskDataWrite()", "Batch file " + batchFileName + " sent successfully. Removing from SD...", enableLogging);
              SD.remove("/backup/" + batchFileName);
              logMsg("taskDataWrite()", "Batch file " + batchFileName + " sent and removed from SD.", enableLogging);
            } 
            else 
            {
              logMsg("taskDataWrite()", "Failed to send batch file " + batchFileName + ". Will retry later.", enableLogging);
              backupFileNameQueue.push(batchFileName); // Push back for retry
              
              // DO NOT USE break; HERE!
              // If you absolutely want the ESP32 to reboot on failure, uncomment the line below:
              // ESP.restart(); 
            }
          }
        }
      }
      else //Jika Jaringan tidak tersedia ATAU auth gagal
      {
        if (backupCount == 0)
        {
          backupFileName = "backup_" + String(timestamp);
          if (backupFileNameQueue.size() >= BACKUP_QUENE_LIMIT)
          {
            // Remove the oldest backup file if queue is full
            String oldestFileName = backupFileNameQueue.front();
            backupFileNameQueue.pop();
            SD.remove("/backup/" + oldestFileName);
            logMsg("taskDataWrite()", "Backup file " + oldestFileName + " removed to make space for new backup.", enableLogging);
          }

          backupFileNameQueue.push(backupFileName);
          logMsg("taskDataWrite()", "Queue size:" + String(backupFileNameQueue.size()), enableLogging);
        }

        saveBackup(backupFileName, doc, false);
       
        backupCount++;

        if (backupCount > BACKUP_COUNT_LIMIT)
        {
          backupCount = 0;
        }
      }
      
      lastDataSend = nowTask;
    }
    
    vTaskDelay(100 / portTICK_PERIOD_MS);  // Delay to prevent tight loop
  }
}

//========================== Main Loop
void setup()
{
  Serial.begin(115200);

  lcd.init();
  lcd.begin(16, 2);
  lcd.backlight();

  initSD();
  initFlowmeter();
  initServoValve();
  initPZEM();
  initSSR();

  ServoValveOpen();
  SSROpen();
  
  writeConfig(false);

  readConfig(false);

  //SD.remove("/state.json");
  readState(false);
  
  // Set servo to match the loaded state from SD card
  if (water_valve_state) 
  {
    ServoValveOpen();
  } 
  else 
  {
    ServoValveClose();
  }
  
  Serial.printf("Setup(): Firmware version: %s\n", curr_version);

  connectToWiFi(true);

  syncTime(true);

  lastAPIResponse = getAPIKey(true);
  lastAuthResponse = authDevice(true);

  printTime = millis();

  // Create tasks pinned to specific cores
  // Core 0: Sensor reading and display (real-time tasks)
  xTaskCreatePinnedToCore(
    taskSensorRead,     // Task function
    "SensorReadTask",   // Task name
    8192,               // Stack size (bytes)
    NULL,               // Parameters
    1,                  // Priority
    NULL,               // Task handle
    0                   // Core 0
  );

  // Core 1: Data writing and network communication
  xTaskCreatePinnedToCore(
    taskDataWrite,      // Task function
    "DataWriteTask",    // Task name
    8192,               // Stack size (bytes)
    NULL,               // Parameters
    1,                  // Priority
    NULL,               // Task handle
    1                   // Core 1
  );
}


void loop()
{

}

