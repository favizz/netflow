#include "sRusun_Data_Handler.h"
#include "sRusun_Base_Function.h"
#include "sRusun_Flowmeter.h"
#include "sRusun_Kwhmeter.h"
#include "sRusun_servo_valve.h"
#include "SRusun_electricity_SSR.h"
#include "sRusun_Firmware_Update.h"

#include <ArduinoJson.h>

WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

void initMQTT() {
  espClient.setInsecure(); // Ganti dengan CA Cert untuk Production
  mqttClient.setServer(mqttBroker.c_str(), mqttPort);
  mqttClient.setCallback(mqttCallback);
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    logMsg("MQTT", "Menghubungkan ke MQTT Broker...", enableLogging);
    if (mqttClient.connect(deviceSerialNumber.c_str())) {
      logMsg("MQTT", "Terhubung!", enableLogging);
      mqttClient.subscribe(mqttTopicCmd.c_str(), 1);
      mqttClient.subscribe(mqttTopicOTA.c_str(), 1);
    } else {
      logMsg("MQTT", "Gagal, status=" + String(mqttClient.state()) + " Coba lagi...", enableLogging);
      vTaskDelay(5000 / portTICK_PERIOD_MS);
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);
  
  if (topicStr == mqttTopicCmd) {
    // Asumsi payload instruksi kontrol menggunakan JSON agar mudah dibaca dari web dashboard
    String msg;
    for (int i = 0; i < length; i++) msg += (char)payload[i];
    
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, msg);
    if (!error) {
      String component = doc["component_name"].as<String>();
      bool action = doc["instruction_to"].as<bool>();
      
      if (component == "water_valve") {
        action ? ServoValveOpen() : ServoValveClose();
      } else if (component == "electricity") {
        action ? SSROpen() : SSRClose();
      }
      logMsg("MQTT_CMD", "Eksekusi " + component + " ke status " + String(action), enableLogging);
    }
  } else if (topicStr == mqttTopicOTA) {
    // Trigger OTA dari topik khusus
    String msg;
    for (int i = 0; i < length; i++) msg += (char)payload[i];
    StaticJsonDocument<256> doc;
    if (!deserializeJson(doc, msg)) {
      firmware_url = doc["binary_link"].as<String>();
      recieve_version = doc["version"].as<String>();
      is_updating = true;
    }
  }
}

bool publishSensorData(bool logger) {
  if (!mqttClient.connected()) return false;

  SensorPayload dataMap = {
    deviceSerialNumber.c_str(),
    ((uint64_t)timestamp) * 1000,
    water_valve_state, volume, flowRate,
    SSR_state, energy, power, voltage
  };

  MsgPack::Packer packer;
  packer.serialize(dataMap);

  bool success = mqttClient.publish(mqttTopicData.c_str(), packer.data(), packer.size());
  
  if (logger && success) {
    logMsg("MQTT", "Data terkirim ke " + mqttTopicData + " (MsgPack Biner)", true);
  }
  return success;
}