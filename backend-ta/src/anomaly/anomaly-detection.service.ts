import { Injectable } from '@nestjs/common';
import { ANOMALY_DETECTION_CONFIG as CFG } from './anomaly.constants';
import type {
  AnomalyDetectionContext,
  AnomalyItem,
  SafetyCommand,
} from './anomaly.types';

/**
 * Pure domain service for anomaly detection.
 * All methods are deterministic functions of their inputs with no side effects.
 * No database access, no MQTT, no I/O — fully testable without NestJS infrastructure.
 */
@Injectable()
export class AnomalyDetectionService {
  /**
   * Runs all 11 detection algorithms against the provided context.
   *
   * @param context - Snapshot of unit state, sensor readings, and timing metadata.
   * @returns Array of detected anomalies. Empty array means all systems nominal.
   */
  detectAll(context: AnomalyDetectionContext): AnomalyItem[] {
    const anomalies: AnomalyItem[] = [];

    const lowElec = this.detectLowElectricityToken(context);
    if (lowElec) anomalies.push(lowElec);

    const lowWater = this.detectLowWaterToken(context);
    if (lowWater) anomalies.push(lowWater);

    if (!context.unit.device_id) return anomalies;

    const offline = this.detectDeviceOffline(context);
    if (offline) anomalies.push(offline);

    const latest = context.readings[0] ?? null;
    if (!latest) return anomalies;

    const malfunction = this.detectSensorMalfunction(context);
    if (malfunction) {
      anomalies.push(malfunction);
      return anomalies;
    }

    const jailbreak = this.detectJailbreak(context, latest);
    if (jailbreak) anomalies.push(jailbreak);

    const mcbTrip = this.detectMcbTrip(
      latest,
      context.unit.unit_no,
      context.detectionTimestamp,
    );
    if (mcbTrip) anomalies.push(mcbTrip);

    const voltageAnomaly = this.detectVoltageAnomaly(
      latest,
      context.unit.unit_no,
      context.detectionTimestamp,
    );
    if (voltageAnomaly) anomalies.push(voltageAnomaly);

    const lowPowerFactor = this.detectLowPowerFactor(
      latest,
      context.unit.unit_no,
      context.detectionTimestamp,
    );
    if (lowPowerFactor) anomalies.push(lowPowerFactor);

    const usageSpike = this.detectUsageSpike(context);
    if (usageSpike) anomalies.push(usageSpike);

    const waterLeak = this.detectWaterLeak(
      context.readings,
      context.detectionTimestamp,
    );
    if (waterLeak) anomalies.push(waterLeak);

    const zeroFlow = this.detectZeroFlow(context, latest);
    if (zeroFlow) anomalies.push(zeroFlow);

    const backflow = this.detectBackflow(
      latest,
      context.unit.unit_no,
      context.detectionTimestamp,
    );
    if (backflow) anomalies.push(backflow);

    return anomalies;
  }

  /**
   * Evaluates the current telemetry snapshot for conditions requiring immediate
   * hardware safety commands independent of the throttled full detection cycle.
   *
   * @param context - Current unit state and latest sensor values.
   * @returns Array of safety commands that should be emitted to the device.
   */
  detectSafetyCommands(
    context: Pick<AnomalyDetectionContext, 'unit'> & {
      powerWatts: number;
      voltageVolts: number;
      flowLitresPerMin: number;
    },
  ): SafetyCommand[] {
    const commands: SafetyCommand[] = [];
    const { unit, powerWatts, voltageVolts, flowLitresPerMin } = context;

    if (!unit.device_id) return commands;

    const electricityJailbreakDetected =
      Number(unit.token_electricity) <= 0 &&
      !unit.relay_status &&
      powerWatts > CFG.jailbreakMinPowerWatts;

    const mcbOverloadDetected = powerWatts > CFG.mcbWattLimit;
    const criticalOvervoltageDetected =
      voltageVolts > CFG.criticalVoltageMaxVolts;

    if (electricityJailbreakDetected) {
      commands.push({
        deviceId: unit.device_id,
        actuatorType: 'relay',
        triggerReason: 'jailbreak_electricity',
      });
    }

    if (mcbOverloadDetected && !electricityJailbreakDetected) {
      commands.push({
        deviceId: unit.device_id,
        actuatorType: 'relay',
        triggerReason: 'mcb_trip',
      });
    }

    if (
      criticalOvervoltageDetected &&
      !electricityJailbreakDetected &&
      !mcbOverloadDetected
    ) {
      commands.push({
        deviceId: unit.device_id,
        actuatorType: 'relay',
        triggerReason: 'overvoltage',
      });
    }

    const waterJailbreakDetected =
      Number(unit.token_water) <= 0 &&
      !unit.valve_status &&
      flowLitresPerMin > CFG.jailbreakMinFlowLitresPerMin;

    if (waterJailbreakDetected) {
      commands.push({
        deviceId: unit.device_id,
        actuatorType: 'valve',
        triggerReason: 'jailbreak_water',
      });
    }

    return commands;
  }

  /**
   * Detects sustained low-variance water flow indicating a probable pipe leak.
   * Uses coefficient of variation (CoV = stddev / mean) on the last N readings.
   *
   * @param readings - Time-ordered meter readings (newest first).
   * @param detectionTimestamp - ISO string for the detectedAt field.
   * @returns AnomalyItem if leak pattern is detected, null otherwise.
   */
  detectWaterLeak(
    readings: AnomalyDetectionContext['readings'],
    detectionTimestamp: string,
  ): AnomalyItem | null {
    if (readings.length < CFG.waterLeakMinReadingCount) return null;

    const nonZeroFlows = readings
      .map((reading) => reading.water_flow)
      .filter((flow): flow is number => flow !== null && flow > 0.05);

    if (nonZeroFlows.length < readings.length * 0.9) return null;
    if (nonZeroFlows.length < CFG.waterLeakMinReadingCount) return null;

    const meanFlowLitresPerMin =
      nonZeroFlows.reduce((total, flow) => total + flow, 0) /
      nonZeroFlows.length;

    if (meanFlowLitresPerMin < CFG.waterLeakMinFlowLitresPerMin) return null;

    const variance =
      nonZeroFlows.reduce(
        (total, flow) => total + Math.pow(flow - meanFlowLitresPerMin, 2),
        0,
      ) / nonZeroFlows.length;

    const coefficientOfVariation = Math.sqrt(variance) / meanFlowLitresPerMin;

    if (coefficientOfVariation >= CFG.waterLeakMaxCoefficientOfVariation)
      return null;

    return {
      anomalyType: 'water_leak',
      severity: 'warning',
      target: 'both',
      message: `Kemungkinan kebocoran: debit rata-rata ${meanFlowLitresPerMin.toFixed(2)} L/menit konstan dalam ${readings.length} pembacaan.`,
      metadata: {
        meanFlowLitresPerMin: parseFloat(meanFlowLitresPerMin.toFixed(3)),
        coefficientOfVariation: parseFloat(coefficientOfVariation.toFixed(3)),
        readingsChecked: readings.length,
      },
      detectedAt: detectionTimestamp,
    };
  }

  /**
   * Detects absence of water flow while the valve is open and tokens are positive.
   * Indicates a possible supply-side outage or blocked pipe.
   *
   * @param context - Detection context containing unit state and readings window.
   * @param latestReading - The most recent meter reading.
   * @returns AnomalyItem if extended zero flow is detected, null otherwise.
   */
  detectZeroFlow(
    context: AnomalyDetectionContext,
    latestReading: AnomalyDetectionContext['readings'][0],
  ): AnomalyItem | null {
    const { unit, readings, detectionTimestamp } = context;

    if (!unit.valve_status) return null;
    if (Number(unit.token_water) <= 0) return null;

    const windowReadings = readings.slice(0, CFG.zeroFlowWindowSize);
    if (windowReadings.length < CFG.zeroFlowWindowSize) return null;

    const validFlowReadings = windowReadings.filter(
      (reading) => reading.water_flow !== null,
    );
    if (validFlowReadings.length < CFG.zeroFlowMinReadingCount) return null;

    const allReadingsShowZeroFlow = validFlowReadings.every(
      (reading) => (reading.water_flow ?? 0) <= CFG.zeroFlowMaxLitresPerMin,
    );

    if (!allReadingsShowZeroFlow) return null;

    const latestFlow = latestReading.water_flow ?? 0;

    return {
      anomalyType: 'zero_flow',
      severity: 'warning',
      target: 'both',
      message: `Tidak ada aliran air selama ${validFlowReadings.length} pembacaan terakhir meskipun katup terbuka dan saldo mencukupi.`,
      metadata: {
        validReadingsChecked: validFlowReadings.length,
        latestFlowLitresPerMin: latestFlow,
        maxZeroFlowThreshold: CFG.zeroFlowMaxLitresPerMin,
        valveStatus: unit.valve_status,
        tokenWaterM3: unit.token_water,
      },
      detectedAt: detectionTimestamp,
    };
  }

  /**
   * Detects reverse flow through the water meter indicating installation error
   * or backpressure from the building supply.
   *
   * @param latestReading - The most recent meter reading.
   * @param unitNumber - Unit identifier for the alert message.
   * @param detectionTimestamp - ISO string for the detectedAt field.
   * @returns AnomalyItem if backflow is detected, null otherwise.
   */
  detectBackflow(
    latestReading: AnomalyDetectionContext['readings'][0],
    unitNumber: string,
    detectionTimestamp: string,
  ): AnomalyItem | null {
    if (latestReading.water_flow === null) return null;
    if (latestReading.water_flow >= CFG.backflowThresholdLitresPerMin)
      return null;

    return {
      anomalyType: 'backflow',
      severity: 'warning',
      target: 'both',
      message: `Aliran air balik terdeteksi pada unit ${unitNumber}: ${latestReading.water_flow.toFixed(2)} L/menit. Periksa instalasi pipa.`,
      metadata: {
        flowLitresPerMin: latestReading.water_flow,
        backflowThreshold: CFG.backflowThresholdLitresPerMin,
      },
      detectedAt: detectionTimestamp,
    };
  }

  private detectLowElectricityToken(
    context: AnomalyDetectionContext,
  ): AnomalyItem | null {
    const { unit, detectionTimestamp } = context;
    const tokenKwh = Number(unit.token_electricity);

    if (tokenKwh <= 0) return null;
    if (tokenKwh >= CFG.lowElectricityTokenKwh) return null;

    return {
      anomalyType: 'low_electricity_token',
      severity: 'warning',
      target: 'resident',
      message: `Token listrik hampir habis: ${tokenKwh.toFixed(2)} kWh. Segera top-up.`,
      metadata: {
        tokenKwh,
        thresholdKwh: CFG.lowElectricityTokenKwh,
      },
      detectedAt: detectionTimestamp,
    };
  }

  private detectLowWaterToken(
    context: AnomalyDetectionContext,
  ): AnomalyItem | null {
    const { unit, detectionTimestamp } = context;
    const tokenM3 = Number(unit.token_water);

    if (tokenM3 <= 0) return null;
    if (tokenM3 >= CFG.lowWaterTokenM3) return null;

    return {
      anomalyType: 'low_water_token',
      severity: 'warning',
      target: 'resident',
      message: `Token air hampir habis: ${tokenM3.toFixed(2)} m³. Segera top-up.`,
      metadata: {
        tokenM3,
        thresholdM3: CFG.lowWaterTokenM3,
      },
      detectedAt: detectionTimestamp,
    };
  }

  private detectDeviceOffline(
    context: AnomalyDetectionContext,
  ): AnomalyItem | null {
    const { unit, readings, latestMqttArrivalMs, detectionTimestamp } = context;

    const latestReading = readings[0] ?? null;
    const databaseAgeMs = latestReading
      ? Date.now() - new Date(latestReading.time).getTime()
      : Infinity;

    const isMqttArrivalRecent =
      Date.now() - latestMqttArrivalMs < CFG.mqttRecentArrivalWindowMs;
    const isDatabaseReadingRecent = databaseAgeMs < CFG.offlineThresholdMs;

    if (isMqttArrivalRecent || isDatabaseReadingRecent) return null;

    return {
      anomalyType: 'device_offline',
      severity: 'critical',
      target: 'admin',
      message: `Perangkat unit ${unit.unit_no} offline. Tidak ada data masuk selama ${Math.floor(databaseAgeMs / 60_000)} menit.`,
      metadata: {
        lastSeenMs: databaseAgeMs,
        offlineThresholdMs: CFG.offlineThresholdMs,
      },
      detectedAt: detectionTimestamp,
    };
  }

  private detectSensorMalfunction(
    context: AnomalyDetectionContext,
  ): AnomalyItem | null {
    const { unit, readings, detectionTimestamp } = context;
    const windowReadings = readings.slice(0, CFG.sensorMalfunctionWindowSize);

    if (windowReadings.length < CFG.sensorMalfunctionMinReadings) return null;

    const isValueMissing = (value: unknown): boolean =>
      value === null || value === undefined || isNaN(Number(value));

    const allReadingsHaveNullSensors = windowReadings.every(
      (reading) =>
        isValueMissing(reading.power) &&
        isValueMissing(reading.voltage) &&
        isValueMissing(reading.water_flow),
    );

    if (!allReadingsHaveNullSensors) return null;

    return {
      anomalyType: 'sensor_malfunction',
      severity: 'warning',
      target: 'both',
      message: `Sensor tidak merespons pada unit ${unit.unit_no}: ${windowReadings.length} pembacaan terakhir semua kosong.`,
      metadata: { readingsChecked: windowReadings.length },
      detectedAt: detectionTimestamp,
    };
  }

  private detectJailbreak(
    context: AnomalyDetectionContext,
    latestReading: AnomalyDetectionContext['readings'][0],
  ): AnomalyItem | null {
    const { unit, detectionTimestamp } = context;
    const powerWatts = latestReading.power ?? 0;
    const flowLitresPerMin = latestReading.water_flow ?? 0;

    const electricityBypassDetected =
      Number(unit.token_electricity) <= 0 &&
      !unit.relay_status &&
      powerWatts > CFG.jailbreakMinPowerWatts;

    const waterBypassDetected =
      Number(unit.token_water) <= 0 &&
      !unit.valve_status &&
      flowLitresPerMin > CFG.jailbreakMinFlowLitresPerMin;

    if (!electricityBypassDetected && !waterBypassDetected) return null;

    const bypassDescriptions: string[] = [];
    if (electricityBypassDetected) {
      bypassDescriptions.push(
        `listrik: ${powerWatts.toFixed(0)} W (relay OFF)`,
      );
    }
    if (waterBypassDetected) {
      bypassDescriptions.push(
        `air: ${flowLitresPerMin.toFixed(2)} L/min (valve CLOSE)`,
      );
    }

    return {
      anomalyType: 'jailbreak',
      severity: 'critical',
      target: 'admin',
      message: `Bypass terdeteksi pada unit ${unit.unit_no}: cutoff aktif tapi sensor masih aktif — ${bypassDescriptions.join(', ')}.`,
      metadata: {
        tokenKwh: unit.token_electricity,
        tokenM3: unit.token_water,
        relayStatus: unit.relay_status,
        valveStatus: unit.valve_status,
        powerWatts,
        flowLitresPerMin,
      },
      detectedAt: detectionTimestamp,
    };
  }

  private detectMcbTrip(
    latestReading: AnomalyDetectionContext['readings'][0],
    unitNumber: string,
    detectionTimestamp: string,
  ): AnomalyItem | null {
    const powerWatts = latestReading.power ?? 0;

    if (powerWatts <= CFG.mcbWattLimit) return null;

    return {
      anomalyType: 'mcb_trip',
      severity: 'critical',
      target: 'both',
      message: `Daya melebihi kapasitas MCB pada unit ${unitNumber}: ${powerWatts.toFixed(0)} W (batas ${CFG.mcbWattLimit} W).`,
      metadata: {
        powerWatts,
        limitWatts: CFG.mcbWattLimit,
      },
      detectedAt: detectionTimestamp,
    };
  }

  private detectVoltageAnomaly(
    latestReading: AnomalyDetectionContext['readings'][0],
    unitNumber: string,
    detectionTimestamp: string,
  ): AnomalyItem | null {
    if (latestReading.voltage === null || latestReading.voltage <= 0)
      return null;

    const voltageVolts = latestReading.voltage;
    const isWithinSafeRange =
      voltageVolts >= CFG.safeVoltageMinVolts &&
      voltageVolts <= CFG.safeVoltageMaxVolts;

    if (isWithinSafeRange) return null;

    const isCritical =
      voltageVolts < CFG.criticalVoltageMinVolts ||
      voltageVolts > CFG.criticalVoltageMaxVolts;

    const directionLabel =
      voltageVolts > CFG.safeVoltageMaxVolts
        ? 'terlalu tinggi'
        : 'terlalu rendah';

    return {
      anomalyType: 'voltage_anomaly',
      severity: isCritical ? 'critical' : 'warning',
      target: 'both',
      message: `Tegangan ${directionLabel} pada unit ${unitNumber}: ${voltageVolts.toFixed(1)} V (aman: ${CFG.safeVoltageMinVolts}–${CFG.safeVoltageMaxVolts} V).`,
      metadata: {
        voltageVolts,
        safeMinVolts: CFG.safeVoltageMinVolts,
        safeMaxVolts: CFG.safeVoltageMaxVolts,
      },
      detectedAt: detectionTimestamp,
    };
  }

  private detectLowPowerFactor(
    latestReading: AnomalyDetectionContext['readings'][0],
    unitNumber: string,
    detectionTimestamp: string,
  ): AnomalyItem | null {
    if (latestReading.power === null) return null;
    if (latestReading.voltage === null) return null;
    if (latestReading.current === null) return null;
    if (latestReading.current <= CFG.lowPowerFactorMinAmps) return null;
    if (latestReading.power <= CFG.lowPowerFactorMinWatts) return null;

    const apparentPowerVoltAmps = latestReading.voltage * latestReading.current;
    if (apparentPowerVoltAmps <= 0) return null;

    const powerFactor = latestReading.power / apparentPowerVoltAmps;
    if (powerFactor >= CFG.lowPowerFactorThreshold) return null;

    return {
      anomalyType: 'low_power_factor',
      severity: 'warning',
      target: 'both',
      message: `Faktor daya rendah pada unit ${unitNumber}: ${(powerFactor * 100).toFixed(0)}% (minimum ${CFG.lowPowerFactorThreshold * 100}%).`,
      metadata: {
        powerFactor: parseFloat(powerFactor.toFixed(3)),
        realPowerWatts: latestReading.power,
        apparentPowerVoltAmps: parseFloat(apparentPowerVoltAmps.toFixed(2)),
      },
      detectedAt: detectionTimestamp,
    };
  }

  private detectUsageSpike(
    context: AnomalyDetectionContext,
  ): AnomalyItem | null {
    const { unit, readings, detectionTimestamp } = context;

    const latestReading = readings[0] ?? null;
    if (!latestReading) return null;

    const currentPowerWatts = latestReading.power ?? 0;
    if (currentPowerWatts <= 0) return null;

    const windowReadings = readings.slice(0, CFG.usageSpikeReadingWindowSize);
    if (windowReadings.length < CFG.usageSpikeReadingWindowSize) return null;

    const validPowerReadings = windowReadings
      .map((reading) => reading.power)
      .filter((power): power is number => power !== null && power >= 0);

    if (validPowerReadings.length < CFG.usageSpikeReadingWindowSize)
      return null;

    const baselineReadings = validPowerReadings.slice(
      CFG.usageSpikeBaselineWindowSize,
    );
    if (baselineReadings.length < CFG.usageSpikeBaselineWindowSize) return null;

    const baselineAverageWatts =
      baselineReadings.reduce((total, power) => total + power, 0) /
      baselineReadings.length;

    if (baselineAverageWatts <= CFG.usageSpikeMinBaselineWatts) return null;
    if (currentPowerWatts <= CFG.usageSpikeMinCurrentWatts) return null;
    if (currentPowerWatts <= baselineAverageWatts * CFG.usageSpikeMultiplier)
      return null;

    const spikeRatio = currentPowerWatts / baselineAverageWatts;

    return {
      anomalyType: 'usage_spike',
      severity: 'warning',
      target: 'both',
      message: `Lonjakan konsumsi pada unit ${unit.unit_no}: ${currentPowerWatts.toFixed(0)} W (${spikeRatio.toFixed(1)}× rata-rata ${baselineAverageWatts.toFixed(0)} W).`,
      metadata: {
        currentPowerWatts,
        baselineAverageWatts: parseFloat(baselineAverageWatts.toFixed(2)),
        spikeRatio: parseFloat(spikeRatio.toFixed(2)),
      },
      detectedAt: detectionTimestamp,
    };
  }
}
