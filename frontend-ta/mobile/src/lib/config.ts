export const MQTT_CONFIG = {
  brokerUrl:
    (import.meta.env.VITE_MQTT_BROKER_URL as string | undefined) ||
    'ws://localhost:8083/mqtt',
  username: (import.meta.env.VITE_MQTT_USERNAME as string | undefined) || '',
  password: (import.meta.env.VITE_MQTT_PASSWORD as string | undefined) || '',
  telemetryTopic(unitId: string) {
    return `device/DEV-${unitId}/data`;
  },
  powerCommandTopic(unitId: string) {
    return `device/DEV-${unitId}/relay/set`;
  },
  waterCommandTopic(unitId: string) {
    return `device/DEV-${unitId}/valve/set`;
  },
};
