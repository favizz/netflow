
export const MQTT_CONFIG = {
    brokerUrl: process.env.NEXT_PUBLIC_MQTT_BROKER_URL || "wss://860d79cbf30e4ed9bd13903e0dbd6db5.s1.eu.hivemq.cloud:8884/mqtt",
    username: process.env.NEXT_PUBLIC_MQTT_USERNAME || "alat_iot",
    password: process.env.NEXT_PUBLIC_MQTT_PASSWORD || "Flowmeter123",
    topics: {
        TELEMETRY: "jarrdin/A-1204/telemetry",
        POWER_CMD: "jarrdin/A-1204/power/command",
        WATER_CMD: "jarrdin/A-1204/water/command"
    }
};