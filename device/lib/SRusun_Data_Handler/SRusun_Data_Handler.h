#ifndef SRUSUN_DATA_HANDLER_H
#define SRUSUN_DATA_HANDLER_H

#include <Arduino.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

extern WiFiClientSecure espClient;
extern PubSubClient mqttClient;

void initMQTT();
void reconnectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
bool publishSensorData(bool logger);


#endif