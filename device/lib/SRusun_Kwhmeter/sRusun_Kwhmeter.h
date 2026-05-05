#ifndef SRUSUN_KWHMETER_H
#define SRUSUN_KWHMETER_H

#include <Arduino.h>
#include <PZEM004Tv30.h>

extern float voltage;
extern float current;
extern float power;
extern float energy;
extern float frequency;
extern float pf;
extern const int rxPin;
extern const int txPin;

void initPZEM();
void readPZEM();
void ResetEnergy();

#endif // SRUSUN_KWHMETER_H