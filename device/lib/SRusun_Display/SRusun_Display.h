#ifndef SRUSUN_DISPLAY_H
#define SRUSUN_DISPLAY_H

#include <Arduino.h>
#include <SD.h>
#include <LiquidCrystal_I2C.h>

extern int selectedDisplay; // 0: flow & volume, 1: energy & power

void showData();
void lcdShowData();
void showInitLCD();

#endif // SRUSUN_DISPLAY_H