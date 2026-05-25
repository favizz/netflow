import { AnomalyDetectionService } from '../anomaly-detection.service';
import { ANOMALY_DETECTION_CONFIG as CFG } from '../anomaly.constants';
import type { AnomalyDetectionContext } from '../anomaly.types';

function makeReading(
  overrides: Partial<AnomalyDetectionContext['readings'][0]> = {},
): AnomalyDetectionContext['readings'][0] {
  return {
    time: new Date(),
    device_id: 'DEV-A-101',
    voltage: 220,
    current: 0.9,
    power: 200,
    water_flow: 0.5,
    energy_total: 10,
    water_total: 5,
    ...overrides,
  };
}

function makeReadings(
  count: number,
  overrides: Partial<AnomalyDetectionContext['readings'][0]> = {},
): AnomalyDetectionContext['readings'][0][] {
  return Array.from({ length: count }, () => makeReading(overrides));
}

function makeUnit(
  overrides: Partial<AnomalyDetectionContext['unit']> = {},
): AnomalyDetectionContext['unit'] {
  return {
    unit_no: 'A-101',
    device_id: 'DEV-A-101',
    token_electricity: 100,
    token_water: 50,
    relay_status: true,
    valve_status: true,
    resident_email: 'resident@test.com',
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<AnomalyDetectionContext> = {},
): AnomalyDetectionContext {
  return {
    unit: makeUnit(),
    readings: makeReadings(60),
    latestMqttArrivalMs: Date.now(),
    detectionTimestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('AnomalyDetectionService', () => {
  let service: AnomalyDetectionService;

  beforeEach(() => {
    service = new AnomalyDetectionService();
  });

  describe('detectLowElectricityToken', () => {
    it('triggers when token_electricity is below threshold', () => {
      const context = makeContext({
        unit: makeUnit({
          token_electricity: CFG.lowElectricityTokenKwh - 0.01,
        }),
      });
      const anomalies = service.detectAll(context);
      expect(
        anomalies.some((a) => a.anomalyType === 'low_electricity_token'),
      ).toBe(true);
    });

    it('does not trigger when token_electricity equals threshold', () => {
      const context = makeContext({
        unit: makeUnit({ token_electricity: CFG.lowElectricityTokenKwh }),
      });
      const anomalies = service.detectAll(context);
      expect(
        anomalies.some((a) => a.anomalyType === 'low_electricity_token'),
      ).toBe(false);
    });

    it('does not trigger when token_electricity is zero (already depleted, not a warning)', () => {
      const context = makeContext({
        unit: makeUnit({ token_electricity: 0 }),
      });
      const anomalies = service.detectAll(context);
      expect(
        anomalies.some((a) => a.anomalyType === 'low_electricity_token'),
      ).toBe(false);
    });

    it('sets target to resident only', () => {
      const context = makeContext({
        unit: makeUnit({ token_electricity: 2 }),
      });
      const anomalies = service.detectAll(context);
      const found = anomalies.find(
        (a) => a.anomalyType === 'low_electricity_token',
      );
      expect(found?.target).toBe('resident');
    });
  });

  describe('detectLowWaterToken', () => {
    it('triggers when token_water is below threshold', () => {
      const context = makeContext({
        unit: makeUnit({ token_water: CFG.lowWaterTokenM3 - 0.01 }),
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'low_water_token')).toBe(
        true,
      );
    });

    it('does not trigger when token_water equals threshold', () => {
      const context = makeContext({
        unit: makeUnit({ token_water: CFG.lowWaterTokenM3 }),
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'low_water_token')).toBe(
        false,
      );
    });

    it('does not trigger when token_water is zero', () => {
      const context = makeContext({
        unit: makeUnit({ token_water: 0 }),
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'low_water_token')).toBe(
        false,
      );
    });

    it('low_electricity_token and low_water_token anomalies are both detected simultaneously', () => {
      const context = makeContext({
        unit: makeUnit({
          token_electricity: 2,
          token_water: 0.5,
        }),
      });
      const anomalies = service.detectAll(context);
      expect(
        anomalies.some((a) => a.anomalyType === 'low_electricity_token'),
      ).toBe(true);
      expect(anomalies.some((a) => a.anomalyType === 'low_water_token')).toBe(
        true,
      );
    });
  });

  describe('detectDeviceOffline', () => {
    it('triggers when DB reading is stale and no recent MQTT arrival', () => {
      const staleTime = new Date(Date.now() - CFG.offlineThresholdMs - 60_000);
      const context = makeContext({
        readings: [makeReading({ time: staleTime })],
        latestMqttArrivalMs: Date.now() - CFG.mqttRecentArrivalWindowMs - 1,
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'device_offline')).toBe(
        true,
      );
    });

    it('does not trigger when MQTT arrived within the recent window', () => {
      const staleTime = new Date(Date.now() - CFG.offlineThresholdMs - 60_000);
      const context = makeContext({
        readings: [makeReading({ time: staleTime })],
        latestMqttArrivalMs: Date.now() - 30_000,
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'device_offline')).toBe(
        false,
      );
    });

    it('does not trigger when DB reading is recent', () => {
      const recentTime = new Date(Date.now() - 60_000);
      const context = makeContext({
        readings: [makeReading({ time: recentTime })],
        latestMqttArrivalMs: 0,
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'device_offline')).toBe(
        false,
      );
    });

    it('sets target to admin only', () => {
      const staleTime = new Date(Date.now() - CFG.offlineThresholdMs - 60_000);
      const context = makeContext({
        readings: [makeReading({ time: staleTime })],
        latestMqttArrivalMs: 0,
      });
      const anomalies = service.detectAll(context);
      const found = anomalies.find((a) => a.anomalyType === 'device_offline');
      expect(found?.target).toBe('admin');
    });
  });

  describe('detectSensorMalfunction', () => {
    it('triggers when last 10 readings all have null power, voltage, and water_flow', () => {
      const context = makeContext({
        readings: makeReadings(10, {
          power: null,
          voltage: null,
          water_flow: null,
        }),
      });
      const anomalies = service.detectAll(context);
      expect(
        anomalies.some((a) => a.anomalyType === 'sensor_malfunction'),
      ).toBe(true);
    });

    it('does not trigger when any reading has a value of 0 (valid zero is not null)', () => {
      const readings = makeReadings(10, {
        power: null,
        voltage: null,
        water_flow: null,
      });
      readings[0] = makeReading({ power: 0, voltage: null, water_flow: null });
      const context = makeContext({ readings });
      const anomalies = service.detectAll(context);
      expect(
        anomalies.some((a) => a.anomalyType === 'sensor_malfunction'),
      ).toBe(false);
    });

    it('does not trigger with fewer than minimum required readings', () => {
      const context = makeContext({
        readings: makeReadings(4, {
          power: null,
          voltage: null,
          water_flow: null,
        }),
      });
      const anomalies = service.detectAll(context);
      expect(
        anomalies.some((a) => a.anomalyType === 'sensor_malfunction'),
      ).toBe(false);
    });

    it('stops further detection when sensor malfunction is found', () => {
      const context = makeContext({
        unit: makeUnit({ token_electricity: 2 }),
        readings: makeReadings(10, {
          power: null,
          voltage: null,
          water_flow: null,
        }),
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'mcb_trip')).toBe(false);
      expect(anomalies.some((a) => a.anomalyType === 'voltage_anomaly')).toBe(
        false,
      );
    });
  });

  describe('detectJailbreak', () => {
    it('triggers electricity bypass when token zero, relay OFF, but power above threshold', () => {
      const context = makeContext({
        unit: makeUnit({ token_electricity: 0, relay_status: false }),
        readings: [makeReading({ power: CFG.jailbreakMinPowerWatts + 1 })],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'jailbreak')).toBe(true);
    });

    it('triggers water bypass when water token zero, valve CLOSED, but flow above threshold', () => {
      const context = makeContext({
        unit: makeUnit({ token_water: 0, valve_status: false }),
        readings: [
          makeReading({ water_flow: CFG.jailbreakMinFlowLitresPerMin + 0.1 }),
        ],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'jailbreak')).toBe(true);
    });

    it('does not trigger when token is positive', () => {
      const context = makeContext({
        unit: makeUnit({ token_electricity: 1, relay_status: false }),
        readings: [makeReading({ power: 200 })],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'jailbreak')).toBe(false);
    });

    it('does not trigger when relay is ON (no cutoff attempted yet)', () => {
      const context = makeContext({
        unit: makeUnit({ token_electricity: 0, relay_status: true }),
        readings: [makeReading({ power: 200 })],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'jailbreak')).toBe(false);
    });

    it('sets target to admin only', () => {
      const context = makeContext({
        unit: makeUnit({ token_electricity: 0, relay_status: false }),
        readings: [makeReading({ power: 100 })],
      });
      const anomalies = service.detectAll(context);
      const found = anomalies.find((a) => a.anomalyType === 'jailbreak');
      expect(found?.target).toBe('admin');
    });
  });

  describe('detectMcbTrip', () => {
    it('triggers when power exceeds MCB limit', () => {
      const context = makeContext({
        readings: [makeReading({ power: CFG.mcbWattLimit + 1 })],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'mcb_trip')).toBe(true);
    });

    it('does not trigger when power equals MCB limit exactly', () => {
      const context = makeContext({
        readings: [makeReading({ power: CFG.mcbWattLimit })],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'mcb_trip')).toBe(false);
    });

    it('sets severity to critical', () => {
      const context = makeContext({
        readings: [makeReading({ power: 1500 })],
      });
      const anomalies = service.detectAll(context);
      const found = anomalies.find((a) => a.anomalyType === 'mcb_trip');
      expect(found?.severity).toBe('critical');
    });
  });

  describe('detectVoltageAnomaly', () => {
    it('triggers warning for undervoltage below safe minimum', () => {
      const context = makeContext({
        readings: [makeReading({ voltage: CFG.safeVoltageMinVolts - 1 })],
      });
      const anomalies = service.detectAll(context);
      const found = anomalies.find((a) => a.anomalyType === 'voltage_anomaly');
      expect(found).toBeDefined();
      expect(found?.severity).toBe('warning');
    });

    it('triggers warning for overvoltage above safe maximum', () => {
      const context = makeContext({
        readings: [makeReading({ voltage: CFG.safeVoltageMaxVolts + 1 })],
      });
      const anomalies = service.detectAll(context);
      const found = anomalies.find((a) => a.anomalyType === 'voltage_anomaly');
      expect(found).toBeDefined();
      expect(found?.severity).toBe('warning');
    });

    it('triggers critical for voltage below critical minimum', () => {
      const context = makeContext({
        readings: [makeReading({ voltage: CFG.criticalVoltageMinVolts - 1 })],
      });
      const anomalies = service.detectAll(context);
      const found = anomalies.find((a) => a.anomalyType === 'voltage_anomaly');
      expect(found?.severity).toBe('critical');
    });

    it('triggers critical for voltage above critical maximum', () => {
      const context = makeContext({
        readings: [makeReading({ voltage: CFG.criticalVoltageMaxVolts + 1 })],
      });
      const anomalies = service.detectAll(context);
      const found = anomalies.find((a) => a.anomalyType === 'voltage_anomaly');
      expect(found?.severity).toBe('critical');
    });

    it('does not trigger at nominal voltage', () => {
      const context = makeContext({
        readings: [makeReading({ voltage: 220 })],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'voltage_anomaly')).toBe(
        false,
      );
    });

    it('does not trigger when voltage is null', () => {
      const context = makeContext({
        readings: [makeReading({ voltage: null })],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'voltage_anomaly')).toBe(
        false,
      );
    });
  });

  describe('detectLowPowerFactor', () => {
    it('triggers when power factor is below threshold', () => {
      const powerWatts = 200;
      const voltageVolts = 220;
      const currentAmps = 5;
      const context = makeContext({
        readings: [
          makeReading({
            power: powerWatts,
            voltage: voltageVolts,
            current: currentAmps,
          }),
        ],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'low_power_factor')).toBe(
        true,
      );
    });

    it('does not trigger when power factor equals threshold exactly', () => {
      const voltageVolts = 220;
      const currentAmps = 1;
      const powerWatts =
        voltageVolts * currentAmps * CFG.lowPowerFactorThreshold;
      const context = makeContext({
        readings: [
          makeReading({
            power: powerWatts,
            voltage: voltageVolts,
            current: currentAmps,
          }),
        ],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'low_power_factor')).toBe(
        false,
      );
    });

    it('does not trigger when power is at or below minimum threshold', () => {
      const context = makeContext({
        readings: [
          makeReading({
            power: CFG.lowPowerFactorMinWatts,
            voltage: 220,
            current: 5,
          }),
        ],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'low_power_factor')).toBe(
        false,
      );
    });

    it('does not trigger when current is at or below minimum threshold', () => {
      const context = makeContext({
        readings: [
          makeReading({
            power: 200,
            voltage: 220,
            current: CFG.lowPowerFactorMinAmps,
          }),
        ],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'low_power_factor')).toBe(
        false,
      );
    });
  });

  describe('detectUsageSpike', () => {
    it('triggers when current power exceeds spike multiplier times baseline', () => {
      const baselineWatts = CFG.usageSpikeMinBaselineWatts + 50;
      const spikePower = baselineWatts * CFG.usageSpikeMultiplier + 100;
      const readings = makeReadings(CFG.usageSpikeReadingWindowSize, {
        power: baselineWatts,
      });
      readings[0] = makeReading({ power: spikePower });
      const context = makeContext({ readings });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'usage_spike')).toBe(true);
    });

    it('does not trigger when spike ratio is below multiplier threshold', () => {
      const baselineWatts = 200;
      const subSpikePower = baselineWatts * (CFG.usageSpikeMultiplier - 0.1);
      const readings = makeReadings(CFG.usageSpikeReadingWindowSize, {
        power: baselineWatts,
      });
      readings[0] = makeReading({ power: subSpikePower });
      const context = makeContext({ readings });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'usage_spike')).toBe(
        false,
      );
    });

    it('does not trigger when baseline is at or below minimum baseline threshold', () => {
      const baselineWatts = CFG.usageSpikeMinBaselineWatts;
      const spikePower = baselineWatts * CFG.usageSpikeMultiplier + 100;
      const readings = makeReadings(CFG.usageSpikeReadingWindowSize, {
        power: baselineWatts,
      });
      readings[0] = makeReading({ power: spikePower });
      const context = makeContext({ readings });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'usage_spike')).toBe(
        false,
      );
    });

    it('does not trigger when current power is at or below minimum spike watt threshold', () => {
      const baselineWatts = 200;
      const readings = makeReadings(CFG.usageSpikeReadingWindowSize, {
        power: baselineWatts,
      });
      readings[0] = makeReading({ power: CFG.usageSpikeMinCurrentWatts });
      const context = makeContext({ readings });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'usage_spike')).toBe(
        false,
      );
    });
  });

  describe('detectWaterLeak', () => {
    it('triggers when steady high flow has low coefficient of variation', () => {
      const steadyFlowReadings = makeReadings(CFG.waterLeakMinReadingCount, {
        water_flow: 0.5,
      });
      const result = service.detectWaterLeak(
        steadyFlowReadings,
        new Date().toISOString(),
      );
      expect(result).not.toBeNull();
      expect(result?.anomalyType).toBe('water_leak');
    });

    it('does not trigger when CoV is above the threshold (variable flow)', () => {
      const variableFlowReadings = [
        ...makeReadings(15, { water_flow: 0.5 }),
        ...makeReadings(15, { water_flow: 2.5 }),
      ];
      const result = service.detectWaterLeak(
        variableFlowReadings,
        new Date().toISOString(),
      );
      expect(result).toBeNull();
    });

    it('does not trigger with fewer than minimum required readings', () => {
      const fewReadings = makeReadings(CFG.waterLeakMinReadingCount - 1, {
        water_flow: 0.5,
      });
      const result = service.detectWaterLeak(
        fewReadings,
        new Date().toISOString(),
      );
      expect(result).toBeNull();
    });

    it('does not trigger when mean flow is below minimum threshold', () => {
      const lowFlowReadings = makeReadings(CFG.waterLeakMinReadingCount, {
        water_flow: CFG.waterLeakMinFlowLitresPerMin - 0.1,
      });
      const result = service.detectWaterLeak(
        lowFlowReadings,
        new Date().toISOString(),
      );
      expect(result).toBeNull();
    });

    it('does not trigger when fewer than 90% of readings are non-zero', () => {
      const mixedReadings = makeReadings(CFG.waterLeakMinReadingCount, {
        water_flow: 0.5,
      });
      mixedReadings[0] = makeReading({ water_flow: 0 });
      mixedReadings[1] = makeReading({ water_flow: 0 });
      mixedReadings[2] = makeReading({ water_flow: 0 });
      mixedReadings[3] = makeReading({ water_flow: 0 });
      const result = service.detectWaterLeak(
        mixedReadings,
        new Date().toISOString(),
      );
      expect(result).toBeNull();
    });
  });

  describe('detectZeroFlow', () => {
    it('triggers when valve is open, tokens positive, and all readings show zero flow', () => {
      const context = makeContext({
        unit: makeUnit({ valve_status: true, token_water: 10 }),
        readings: makeReadings(CFG.zeroFlowWindowSize, { water_flow: 0 }),
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'zero_flow')).toBe(true);
    });

    it('does not trigger when valve is closed', () => {
      const context = makeContext({
        unit: makeUnit({ valve_status: false, token_water: 10 }),
        readings: makeReadings(CFG.zeroFlowWindowSize, { water_flow: 0 }),
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'zero_flow')).toBe(false);
    });

    it('does not trigger when water token is zero', () => {
      const context = makeContext({
        unit: makeUnit({ valve_status: true, token_water: 0 }),
        readings: makeReadings(CFG.zeroFlowWindowSize, { water_flow: 0 }),
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'zero_flow')).toBe(false);
    });

    it('does not trigger with fewer readings than window size', () => {
      const context = makeContext({
        unit: makeUnit({ valve_status: true, token_water: 10 }),
        readings: makeReadings(CFG.zeroFlowWindowSize - 1, { water_flow: 0 }),
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'zero_flow')).toBe(false);
    });

    it('does not trigger when some readings show positive flow', () => {
      const readings = makeReadings(CFG.zeroFlowWindowSize, { water_flow: 0 });
      readings[0] = makeReading({ water_flow: 1.5 });
      const context = makeContext({
        unit: makeUnit({ valve_status: true, token_water: 10 }),
        readings,
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'zero_flow')).toBe(false);
    });
  });

  describe('detectBackflow', () => {
    it('triggers when water flow is below backflow threshold', () => {
      const context = makeContext({
        readings: [
          makeReading({ water_flow: CFG.backflowThresholdLitresPerMin - 0.01 }),
        ],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'backflow')).toBe(true);
    });

    it('does not trigger at exactly the threshold value', () => {
      const context = makeContext({
        readings: [
          makeReading({ water_flow: CFG.backflowThresholdLitresPerMin }),
        ],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'backflow')).toBe(false);
    });

    it('does not trigger for zero flow', () => {
      const context = makeContext({
        readings: [makeReading({ water_flow: 0 })],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'backflow')).toBe(false);
    });

    it('does not trigger when water_flow is null', () => {
      const context = makeContext({
        readings: [makeReading({ water_flow: null })],
      });
      const anomalies = service.detectAll(context);
      expect(anomalies.some((a) => a.anomalyType === 'backflow')).toBe(false);
    });
  });

  describe('detectSafetyCommands', () => {
    it('emits relay command for electricity jailbreak', () => {
      const commands = service.detectSafetyCommands({
        unit: makeUnit({ token_electricity: 0, relay_status: false }),
        powerWatts: CFG.jailbreakMinPowerWatts + 1,
        voltageVolts: 220,
        flowLitresPerMin: 0,
      });
      expect(
        commands.some(
          (c) =>
            c.actuatorType === 'relay' &&
            c.triggerReason === 'jailbreak_electricity',
        ),
      ).toBe(true);
    });

    it('emits relay command for MCB overload', () => {
      const commands = service.detectSafetyCommands({
        unit: makeUnit({ token_electricity: 100, relay_status: true }),
        powerWatts: CFG.mcbWattLimit + 1,
        voltageVolts: 220,
        flowLitresPerMin: 0,
      });
      expect(
        commands.some(
          (c) => c.actuatorType === 'relay' && c.triggerReason === 'mcb_trip',
        ),
      ).toBe(true);
    });

    it('emits relay command for critical overvoltage', () => {
      const commands = service.detectSafetyCommands({
        unit: makeUnit({ token_electricity: 100, relay_status: true }),
        powerWatts: 100,
        voltageVolts: CFG.criticalVoltageMaxVolts + 1,
        flowLitresPerMin: 0,
      });
      expect(
        commands.some(
          (c) =>
            c.actuatorType === 'relay' && c.triggerReason === 'overvoltage',
        ),
      ).toBe(true);
    });

    it('emits valve command for water jailbreak', () => {
      const commands = service.detectSafetyCommands({
        unit: makeUnit({ token_water: 0, valve_status: false }),
        powerWatts: 0,
        voltageVolts: 220,
        flowLitresPerMin: CFG.jailbreakMinFlowLitresPerMin + 0.1,
      });
      expect(
        commands.some(
          (c) =>
            c.actuatorType === 'valve' && c.triggerReason === 'jailbreak_water',
        ),
      ).toBe(true);
    });

    it('does not emit any command when all readings are nominal', () => {
      const commands = service.detectSafetyCommands({
        unit: makeUnit({
          token_electricity: 100,
          token_water: 50,
          relay_status: true,
          valve_status: true,
        }),
        powerWatts: 200,
        voltageVolts: 220,
        flowLitresPerMin: 0.5,
      });
      expect(commands).toHaveLength(0);
    });

    it('does not emit commands when device_id is null', () => {
      const commands = service.detectSafetyCommands({
        unit: makeUnit({
          device_id: null,
          token_electricity: 0,
          relay_status: false,
        }),
        powerWatts: 200,
        voltageVolts: 220,
        flowLitresPerMin: 0,
      });
      expect(commands).toHaveLength(0);
    });
  });
});
