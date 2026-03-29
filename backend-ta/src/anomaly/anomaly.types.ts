export type AnomalyType =
  | 'jailbreak'
  | 'water_leak'
  | 'device_offline'
  | 'mcb_trip'
  | 'low_balance'
  | 'voltage_anomaly';

export type AnomalySeverity = 'critical' | 'warning';

export interface AnomalyItem {
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  message: string;
  metadata: Record<string, unknown>;
  detectedAt: string;
}
