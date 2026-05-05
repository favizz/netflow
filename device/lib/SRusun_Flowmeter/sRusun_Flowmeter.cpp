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


#include "sRusun_Flowmeter.h"

//==================== Flowmeter (Only channel 0 used)
const int flowMeterPin = 25;
int64_t pulseCount = 0;
int16_t pulseRate = 0;
const pcnt_unit_t pulseCountUnit = PCNT_UNIT_0;
const float CALIBRATION_FACTOR = 4.45; // Pulses per second for 1 L/min
float flowRate = 0.0; //L/min
float volume = 0.0; //L

void initFlowmeter()
{
  pinMode(flowMeterPin, INPUT_PULLUP);
  setupPCNT(pulseCountUnit, flowMeterPin);
}

void setupPCNT(pcnt_unit_t unit, int gpio) 
{
  pcnt_config_t config = {};
  config.pulse_gpio_num = gpio;
  config.ctrl_gpio_num = PCNT_PIN_NOT_USED;
  config.channel = PCNT_CHANNEL_0;
  config.unit = unit;
  config.pos_mode = PCNT_COUNT_DIS;
  config.neg_mode = PCNT_COUNT_INC;
  config.lctrl_mode = PCNT_MODE_KEEP;
  config.hctrl_mode = PCNT_MODE_KEEP;
  config.counter_h_lim = 10000;
  config.counter_l_lim = 0;

  pcnt_unit_config(&config);
  pcnt_set_filter_value(unit, 1000);
  pcnt_filter_enable(unit);
  pcnt_counter_pause(unit);
  pcnt_counter_clear(unit);
  pcnt_counter_resume(unit);
}

void readFlowmeters()
{
  pcnt_get_counter_value(pulseCountUnit, &pulseRate);
  pcnt_counter_clear(pulseCountUnit);
  pulseCount += pulseRate;
  flowRate = (float)pulseRate / CALIBRATION_FACTOR; //L/min
  volume = (float)pulseCount / CALIBRATION_FACTOR / 60.0; //Liter
}
