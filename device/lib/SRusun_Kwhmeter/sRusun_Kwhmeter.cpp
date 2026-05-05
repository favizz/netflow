#include <Arduino.h>
#include <PZEM004Tv30.h>

#include "sRusun_Kwhmeter.h"

const int rxPin = 16;
const int txPin = 17;

float CAL_FACTOR_POWER = 1.05f;  // matches backend DEFAULTS.CAL_FACTOR_POWER
float voltage = 0.0;
float current = 0.0;
float power = 0.0;
float energy = 0.0;
float frequency = 0.0;
float pf = 0.0;

PZEM004Tv30 pzem(Serial2, rxPin, txPin);

void initPZEM()
{
    Serial2.begin(9600, SERIAL_8N1, rxPin, txPin);
}

void readPZEM()
{

    if(!String(pzem.voltage()).equals("nan")) 
    {
        voltage = pzem.voltage();
        current = pzem.current();
        power = CAL_FACTOR_POWER * pzem.power();
        energy = CAL_FACTOR_POWER * pzem.energy(); //kWh default Register PZEM004T
        frequency = pzem.frequency();
        pf = pzem.pf();
    }

    else 
    {
        //Serial.println("Failed to read from PZEM004T");
    }
}

void ResetEnergy()
{
    PZEM004Tv30 pzem(Serial2, rxPin, txPin);
    pzem.resetEnergy();
}
