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
#include "SRusun_Display.h"
#include "sRusun_Flowmeter.h"
#include "sRusun_Kwhmeter.h"

void showInitLCD()
{
  if (!initSD()) 
  {
    logMsg("SD", "SD Card initialization failed!", enableLogging);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("SD Init Failed!");
    while (true) vTaskDelay(1000 / portTICK_PERIOD_MS);
  }

  logMsg("SD", "SD Card initialized.", enableLogging);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SD Card Ready");
}

void showData()
{
  Serial.print(">");

  Serial.print("volume:");
  Serial.print(volume);
  Serial.print(",");

  Serial.print("flowRate:");
  Serial.print(flowRate);
  Serial.print(",");

  Serial.print("energy:");
  Serial.print(energy);
  Serial.print(",");
  

  Serial.print("power:");
  Serial.print(power);
  Serial.print(",");

  Serial.print("voltage:");
  Serial.print(voltage);

  Serial.println(); // Writes \r\n
}

int selectedDisplay = 0;
void lcdShowData()
{ 
  if (selectedDisplay == 1)
  {
    lcd.begin(16, 2);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("F:");
    lcd.print(flowRate, 1);
    lcd.print(" L/m");

    lcd.setCursor(0, 1);
    lcd.print("V:");
    lcd.print(volume/1000, 1);
    lcd.print(" m3");
  }
  else if (selectedDisplay == 2)
    {
    lcd.begin(16, 2);  
    lcd.setCursor(0, 0);
    lcd.print("E:");
    lcd.print(energy, 1);
    lcd.print(" kWh");

    lcd.setCursor(0, 1);
    lcd.print("P:");
    lcd.print(power, 1);
    lcd.print(" W");
  }

  else if (selectedDisplay == 3)
  {
    lcd.begin(16, 2);
    lcd.setCursor(0, 0);
    lcd.print("V:");
    lcd.print(voltage, 1);
    lcd.print(" Vrms");

    lcd.setCursor(0, 1);
    lcd.print("I:");
    lcd.print(current, 1);
    lcd.print(" Arms");
  }
  else
  {
    selectedDisplay = 0;
  }
}
