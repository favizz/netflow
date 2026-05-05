#include <Arduino.h>

#include "SRusun_electricity_SSR.h"

bool SSR_state = true;
int kSSRPin = 27;

void initSSR()
{
  pinMode(kSSRPin, OUTPUT);
}

void SSROpen()
{
  digitalWrite(kSSRPin, HIGH);
  SSR_state = true;
}

void SSRClose()
{
  digitalWrite(kSSRPin, LOW);
  SSR_state = false;
}