#ifndef SRUSUN_FLOWMETER_H
#define SRUSUN_FLOWMETER_H

#include <Arduino.h>
#include <stdint.h>
#include "driver/pcnt.h"

extern float flowRate; // L/min
extern float volume; // L   
extern int64_t pulseCount; // Total pulse count from the flowmeter
extern const float CALIBRATION_FACTOR; // Pulses per second for 1 L/min
extern const pcnt_unit_t pulseCountUnit; // PCNT unit used for counting pulses
extern const int flowMeterPin; // GPIO pin connected to the flowmeter

void setupPCNT(pcnt_unit_t unit, int gpio);
void readFlowmeters();
void initFlowmeter();

#endif // SRUSUN_FLOWMETER_H