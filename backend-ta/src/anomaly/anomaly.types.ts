export type AnomalyType =
  | 'jailbreak'           // balance=0 but sensors show consumption (admin)
  | 'water_leak'          // constant flow CoV test (both)
  | 'device_offline'      // no telemetry > 10 min (admin)
  | 'mcb_trip'            // power > 1300 W (both)
  | 'low_balance'         // balance < 20k Rp (resident)
  | 'voltage_anomaly'     // voltage outside 198–242 V (both)
  | 'sensor_malfunction'  // all sensor values null (both)
  | 'low_power_factor'    // PF = P/(V×I) < 0.6 (both)
  | 'zero_flow'           // water_flow=0 for 20+ readings while relay ON (both)
  | 'usage_spike'         // power > 3× historical average (both)
  | 'backflow';           // water_flow < 0 (both)

export type AnomalySeverity = 'critical' | 'warning';

/** Who receives this anomaly in their view */
export type AnomalyTarget = 'resident' | 'admin' | 'both';

export interface AnomalyItem {
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  /** Filtered out of resident responses when target === 'admin' */
  target: AnomalyTarget;
  message: string;
  metadata: Record<string, unknown>;
  detectedAt: string;
}
