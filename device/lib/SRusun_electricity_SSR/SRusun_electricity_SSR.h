#ifndef SRUSUN_ELECTRICITY_SSR_H
#define SRUSUN_ELECTRICITY_SSR_H

#include <Arduino.h>

extern bool SSR_state;
extern int kSSRPin;

void initSSR();
void SSROpen();
void SSRClose();

#endif