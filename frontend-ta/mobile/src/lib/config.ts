export const MQTT_CONFIG = {
  brokerUrl: import.meta.env.VITE_MQTT_BROKER_URL as string,
  username: (import.meta.env.VITE_MQTT_USERNAME as string | undefined) ?? '',
  password: (import.meta.env.VITE_MQTT_PASSWORD as string | undefined) ?? '',

  // All topics follow device/{device_id}/xxx — same channel for backend (TCP) and browser (WS).
  // device_id is the raw DB value e.g. "DEV-A-101".  Callers derive it as `DEV-${unitNo}`.
  telemetryTopic(deviceId: string) { return `device/${deviceId}/data`;    },
  commandTopic  (deviceId: string) { return `device/${deviceId}/command`; },
  configTopic   (deviceId: string) { return `device/${deviceId}/config`;  },
  otaTopic      (deviceId: string) { return `device/${deviceId}/ota`;     },
};
