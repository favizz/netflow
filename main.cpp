#include <Arduino.h> 
#include <MsgPack.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// --- KONFIGURASI WIFI & MQTT ---
const char* ssid = "Nevatron";
const char* password = "Nevatron!2024Ok";
const char* mqtt_server = "broker.emqx.io";
WiFiClientSecure espClient;
PubSubClient client(espClient);

// Device ID sesuai dengan Database (Unit A-101)
const char* device_id = "DEV-A-101";

// --- VARIABEL LOKAL UNTUK HYBRID EDGE-MANAGED ---
float balance = 150000.00;  // Local Balance Pool (diperbarui saat top-up)
float energy_tariff = 1444.70; // Harga per KWh
float water_tariff = 5000.00;  // Harga per m3

float et = 1250.00;  // Energy Total (KWh)
float wt = 180.00;   // Water Total (m³)
int rs = 1;          // Relay Status
int vs = 1;          // Valve Status

// --- DEFINISI STRUKTUR DATA MSGPACK ---
struct SensorDataMap {
  MsgPack::str_t k_et; float et;
  MsgPack::str_t k_p;  float p;
  MsgPack::str_t k_v;  float v;
  MsgPack::str_t k_c;  float c;
  MsgPack::str_t k_rs; int rs;
  MsgPack::str_t k_wt; float wt;
  MsgPack::str_t k_wf; float wf;
  MsgPack::str_t k_vs; int vs;
  MsgPack::str_t k_b;  float b; // MENAMBAHKAN BALANCE (Hanya 1 huruf untuk menghemat data)

  MSGPACK_DEFINE_MAP(k_et, et, k_p, p, k_v, v, k_c, c, k_rs, rs, k_wt, wt, k_wf, wf, k_vs, vs, k_b, b);
};

// FUNGSI MENERIMA PERINTAH DARI WEBSITE (JSON Parsing Manual/Sederhana)
void callback(char* topic, byte* payload, unsigned int length) 
{
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println("\n[MQTT] Pesan masuk: " + message);

  // Parsing JSON sederhana untuk aktuator
  if (message.indexOf("\"r\":1") >= 0 || message.indexOf("\"r\": 1") >= 0) rs = 1;
  if (message.indexOf("\"r\":0") >= 0 || message.indexOf("\"r\": 0") >= 0) rs = 0;
  if (message.indexOf("\"v\":1") >= 0 || message.indexOf("\"v\": 1") >= 0) vs = 1;
  if (message.indexOf("\"v\":0") >= 0 || message.indexOf("\"v\": 0") >= 0) vs = 0;

  // Jika ada command Add Balance ("add_b": 50000)
  int addIndex = message.indexOf("\"add_b\":");
  if (addIndex >= 0) {
    int startIndex = addIndex + 8;
    int endIndex = message.indexOf('}', startIndex);
    if (endIndex == -1) endIndex = message.indexOf(',', startIndex);
    
    String amountStr = message.substring(startIndex, endIndex);
    float topUp = amountStr.toFloat();
    balance += topUp;
    Serial.printf("✅ TOP-UP MASUK! Saldo bertambah Rp %.2f. Saldo total: Rp %.2f\n", topUp, balance);
  }

  // FORCE CUT-OFF LOKAL JIKA SALDO HABIS
  if (balance <= 0) {
    rs = 0;
    vs = 0;
    Serial.println("⚠ SALDO HABIS! Sistem memutus listrik & air secara otomatis (Offline Safety).");
  }
}

// FUNGSI RECONNECT
void reconnect() {
  while (!client.connected()) {
    Serial.print("Menghubungkan ke MQTT Broker...");
    // Menggunakan MQTTS (di setServer 8883 dengan WiFiClientSecure)
    // Dalam produksi, sertifikat CA (Root Certificate) broker harus dipasang disini!
    if (client.connect(device_id)) {
      Serial.println("Terhubung!");
      String cmdTopic = "device/" + String(device_id) + "/command";
      client.subscribe(cmdTopic.c_str(), 1);
    } else {
      Serial.print("Gagal, status=");
      Serial.print(client.state());
      Serial.println(" Coba lagi dalam 5 detik");
      delay(5000);
    }
  }
}

void setup() 
{
  Serial.begin(115200);
  Serial.println("Memulai koneksi WiFi...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi terhubung! IP: " + WiFi.localIP().toString());
    
  espClient.setInsecure(); // BAHAYA: Hanya untuk development. Untuk produksi, hapus ini dan gunakan setCACert()
  client.setServer(mqtt_server, 8883);
  client.setCallback(callback);
}

void loop() 
{  
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Hitung simulasi penggunaan (jika hardware menyala)
  float p = (rs == 1) ? 650.00 + random(-50, 50) : 0.0;  // Active Power (W)
  float wf = (vs == 1) ? 2.50 + (random(-50, 50) / 100.0) : 0.0;  // Water Flow Rate (L/min)
  
  float v = 220.00 + random(-5, 5);  // Voltage (V)
  float c = (rs == 1) ? p / v : 0.0;  // Current (A)

  // Akumulasi total
  float addedEnergy = (p / 3600.0) * 5; // Konsumsi KWh selama 5 detik
  float addedWater = (wf / 1000.0) * (5.0 / 60.0); // Konsumsi m3 selama 5 detik
  et += addedEnergy;
  wt += addedWater;

  // DEDUCT BALANCE LOKAL PER 5 DETIK
  float cost = (addedEnergy * energy_tariff) + (addedWater * water_tariff);
  balance -= cost;

  // AUTO-CUTOFF LOKAL (Tidak butuh internet!)
  if (balance <= 0 && (rs == 1 || vs == 1)) {
    balance = 0;
    rs = 0;
    vs = 0;
    Serial.println("⚠ PEMUTUSAN LOKAL: Saldo telah mencapai 0.");
  }

  // Payload MsgPack dengan huruf-huruf paling pendek untuk menghemat data IoT (Sim Card/Bandwidth)
  SensorDataMap payloadData = {
    "et", et,
    "p", p,
    "v", v,
    "c", c,
    "rs", rs,
    "wt", wt,
    "wf", wf,
    "vs", vs,
    "b", balance // Saldo ditambahkan dengan key 'b'
  };

  MsgPack::Packer packer;
  packer.serialize(payloadData);

  String topic = "device/" + String(device_id) + "/data";
  if (client.publish(topic.c_str(), packer.data(), packer.size())) {
    Serial.printf("✅ Dikirim | Rp: %.2f | Listrik: %.1f W | Air: %.2f LPM\n", balance, p, wf);
  }

  delay(5000); // 5 Detik Loop
}