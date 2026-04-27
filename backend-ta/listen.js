const mqtt = require('mqtt');
require('dotenv').config({ path: '../.env' });
const client = mqtt.connect(process.env.MQTT_BROKER_URL || 'mqtt://broker.emqx.io:1883');

client.on('connect', () => {
  console.log('Listening to ALL topics to debug...');
  client.subscribe('#');
});

client.on('message', (topic, message) => {
  if (topic.includes('DEV-A-101')) {
    console.log(`[RCV] Topic: ${topic} | Msg: ${message.toString()}`);
  }
});
