#ifndef SRUSUN_DISPLAY_H
#define SRUSUN_DISPLAY_H

#include <Arduino.h>
#include <LiquidCrystal_I2C.h>

// Forward declaration — SensorSnap is defined in sRusun_SDCard.h
struct SensorSnap;

extern LiquidCrystal_I2C lcd;
extern int lcdPage;
extern int LCD_PAGES;

void initDisplay();
void updateLCD(const SensorSnap& s, float wt);

#endif // SRUSUN_DISPLAY_H
