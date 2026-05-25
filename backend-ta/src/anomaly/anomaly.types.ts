export type AnomalyType =
  | 'jailbreak'
  | 'water_leak'
  | 'device_offline'
  | 'mcb_trip'
  | 'low_electricity_token'
  | 'low_water_token'
  | 'voltage_anomaly'
  | 'sensor_malfunction'
  | 'low_power_factor'
  | 'usage_spike'
  | 'zero_flow'
  | 'backflow';

export type AnomalySeverity = 'critical' | 'warning';

export type AnomalyTarget = 'resident' | 'admin' | 'both';

export interface AnomalyItem {
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  target: AnomalyTarget;
  message: string;
  metadata: Record<string, unknown>;
  detectedAt: string;
}

export interface AnomalyDetectionContext {
  unit: {
    unit_no: string;
    device_id: string | null;
    token_electricity: number;
    token_water: number;
    relay_status: boolean;
    valve_status: boolean;
    resident_email: string | null;
  };
  readings: Array<{
    time: Date;
    device_id: string;
    voltage: number | null;
    current: number | null;
    power: number | null;
    water_flow: number | null;
    energy_total: number | null;
    water_total: number | null;
  }>;
  latestMqttArrivalMs: number;
  detectionTimestamp: string;
}

export interface SafetyCommand {
  deviceId: string;
  actuatorType: 'relay' | 'valve';
  triggerReason:
    | 'jailbreak_electricity'
    | 'jailbreak_water'
    | 'mcb_trip'
    | 'overvoltage';
}
