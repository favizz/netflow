#ifndef SRUSUN_SERVO_VALVE_H
#define SRUSUN_SERVO_VALVE_H

#include <Arduino.h>

extern bool water_valve_state; // Valve state
extern int currAngle;     // Current angle
extern String inputString; // String to hold incoming data
extern const int servoPin; // Servo control pin
extern const int ledcChannel; // PWM channel

// Function prototypes
void initServoValve();
void writeServo(int angle);
void ServoValveOpen();
void ServoValveClose();
void ServoDebounce();

#endif // SRUSUN_SERVO_VALVE_H