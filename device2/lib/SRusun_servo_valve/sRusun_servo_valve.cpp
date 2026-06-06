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


#include "sRusun_servo_valve.h"

//Servo (Only channel 0 used)
const int servoPin = 26;
const int ledcChannel = 0;  // PWM channel
String inputString = ""; // String to hold incoming data

// Servo control variables
uint32_t prevServo = 0;
uint32_t delayServo = 1000;
int angleClose = 125;  // Close angle (90 + 35)
int angleOpen = 55;    // Open angle (90 - 35)
int angleOffset = 5;   // Offset for debounce
int currAngle = 0;     // Current angle
bool water_valve_state = true; // Valve state  

void initServoValve()
{
  ledcSetup(ledcChannel, 50, 16);
  ledcAttachPin(servoPin, ledcChannel);
}

void writeServo(int angle) 
{ 
  int minDuty = 1638;  // 0.5 ms pulse
  int maxDuty = 8192;  // 2.5 ms pulse
  angle = constrain(angle, 0, 180);
  int duty = map(angle, 0, 180, minDuty, maxDuty);
  ledcWrite(ledcChannel, duty);
}

void ServoValveOpen()
{
  prevServo = millis();
  writeServo(angleOpen);
  currAngle = angleOpen;
  water_valve_state = true;
}

void ServoValveClose()
{
  prevServo = millis();
  writeServo(angleClose);
  currAngle = angleClose;
  water_valve_state = false;
}

void ServoDebounce() 
{
  unsigned long now = millis();
  if (water_valve_state)
  {
    if (now - prevServo >= delayServo) 
    {
      writeServo(angleOpen - angleOffset);
      currAngle = angleOpen - angleOffset;
    }
  }
  else
  {
    if (now - prevServo >= delayServo)
    {
      writeServo(angleClose + angleOffset);
      currAngle = angleClose + angleOffset;
    }
  }
}
