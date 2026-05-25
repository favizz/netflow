/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnomalyService } from './anomaly.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { AnomalyNotificationService } from './anomaly-notification.service';
import { MeterReading } from '../device/entities/device.entity';
import { Anomaly } from './entities/anomaly.entity';
import { UnitService } from '../admin/unit/unit.service';
import { ANOMALY_DETECTION_CONFIG as CFG } from './anomaly.constants';
import type { AnomalyItem } from './anomaly.types';

function makeReading(overrides: Partial<MeterReading> = {}): MeterReading {
  return {
    time: new Date(),
    device_id: 'DEV-A-101',
    power: 200,
    voltage: 220,
    current: 0.9,
    water_flow: 0.5,
    energy_total: 10,
    water_total: 5,
    ...overrides,
  } as MeterReading;
}

function makeUnit(overrides: Partial<any> = {}) {
  return {
    id: 1,
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

function makeAnomalyItem(overrides: Partial<AnomalyItem> = {}): AnomalyItem {
  return {
    anomalyType: 'voltage_anomaly',
    severity: 'warning',
    target: 'both',
    message: 'Test anomaly',
    metadata: {},
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AnomalyService', () => {
  let service: AnomalyService;
  let mockUnitService: any;
  let mockMeterReadingRepo: any;
  let mockAnomalyRepo: any;
  let mockMqttClient: any;
  let mockDetectionService: any;
  let mockNotificationService: any;

  beforeEach(async () => {
    jest.useFakeTimers();

    mockUnitService = {
      findByUnitNo: jest.fn().mockResolvedValue(makeUnit()),
      streamAllWithDevice: jest.fn().mockImplementation(async function* () {
        yield [makeUnit()];
      }),
    };

    mockMeterReadingRepo = {
      find: jest.fn().mockResolvedValue([makeReading()]),
      findOne: jest.fn().mockResolvedValue(makeReading()),
    };

    mockAnomalyRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    mockMqttClient = { emit: jest.fn() };

    mockDetectionService = {
      detectAll: jest.fn().mockReturnValue([]),
      detectSafetyCommands: jest.fn().mockReturnValue([]),
    };

    mockNotificationService = {
      notifyResidentOfAnomaly: jest.fn().mockResolvedValue(undefined),
      notifyAdminsOfAnomaly: jest.fn().mockResolvedValue(undefined),
      notifyAdminsOfOfflineUnits: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnomalyService,
        { provide: UnitService, useValue: mockUnitService },
        { provide: getRepositoryToken(MeterReading), useValue: mockMeterReadingRepo },
        { provide: getRepositoryToken(Anomaly), useValue: mockAnomalyRepo },
        { provide: 'MQTT_CLIENT', useValue: mockMqttClient },
        { provide: AnomalyDetectionService, useValue: mockDetectionService },
        { provide: AnomalyNotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<AnomalyService>(AnomalyService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('getAnomaliesForUnit', () => {
    it('filters out admin-only anomalies from resident view', async () => {
      const adminAnomaly = makeAnomalyItem({ anomalyType: 'device_offline', target: 'admin' });
      const residentAnomaly = makeAnomalyItem({ anomalyType: 'low_electricity_token', target: 'resident' });
      mockDetectionService.detectAll.mockReturnValue([adminAnomaly, residentAnomaly]);

      const results = await service.getAnomaliesForUnit('A-101');

      expect(results).not.toContain(adminAnomaly);
      expect(results).toContain(residentAnomaly);
    });

    it('populates cache on first call and returns from cache on second call', async () => {
      mockDetectionService.detectAll.mockReturnValue([makeAnomalyItem()]);

      await service.getAnomaliesForUnit('A-101');
      await service.getAnomaliesForUnit('A-101');

      expect(mockUnitService.findByUnitNo).toHaveBeenCalledTimes(1);
    });
  });

  describe('syncAnomaliesToDatabase', () => {
    it('inserts both low_electricity_token and low_water_token independently', async () => {
      const electricAnomaly = makeAnomalyItem({ anomalyType: 'low_electricity_token' });
      const waterAnomaly = makeAnomalyItem({ anomalyType: 'low_water_token' });

      await service['syncAnomaliesToDatabase']('A-101', [electricAnomaly, waterAnomaly]);

      const savedTypes = mockAnomalyRepo.save.mock.calls.map(
        (callArgs: any[]) => callArgs[0].type,
      );
      expect(savedTypes).toContain('low_electricity_token');
      expect(savedTypes).toContain('low_water_token');
    });

    it('resolves DB anomalies that are no longer in the computed set', async () => {
      const activeDbAnomaly = {
        id: 1,
        device_id: 'DEV-A-101',
        type: 'mcb_trip',
        severity: 'critical',
        resolved_at: null,
      };
      mockAnomalyRepo.find.mockResolvedValue([activeDbAnomaly]);

      await service['syncAnomaliesToDatabase']('A-101', []);

      const savedEntity = mockAnomalyRepo.save.mock.calls[0][0];
      expect(savedEntity.resolved_at).toBeInstanceOf(Date);
    });

    it('does not insert anomalies that already exist as unresolved in DB', async () => {
      const existingDbAnomaly = {
        id: 1,
        device_id: 'DEV-A-101',
        type: 'voltage_anomaly',
        severity: 'warning',
        resolved_at: null,
      };
      mockAnomalyRepo.find.mockResolvedValue([existingDbAnomaly]);

      await service['syncAnomaliesToDatabase']('A-101', [
        makeAnomalyItem({ anomalyType: 'voltage_anomaly' }),
      ]);

      expect(mockAnomalyRepo.save).not.toHaveBeenCalled();
    });

    it('sends resident notification for new critical anomalies targeting resident', async () => {
      const criticalAnomaly = makeAnomalyItem({
        anomalyType: 'mcb_trip',
        severity: 'critical',
        target: 'both',
      });

      await service['syncAnomaliesToDatabase']('A-101', [criticalAnomaly]);

      expect(mockNotificationService.notifyResidentOfAnomaly).toHaveBeenCalledWith(
        'resident@test.com',
        criticalAnomaly,
        'A-101',
      );
    });

    it('does not send resident notification for admin-only anomalies', async () => {
      const adminOnlyAnomaly = makeAnomalyItem({
        anomalyType: 'jailbreak',
        severity: 'critical',
        target: 'admin',
      });

      await service['syncAnomaliesToDatabase']('A-101', [adminOnlyAnomaly]);

      expect(mockNotificationService.notifyResidentOfAnomaly).not.toHaveBeenCalled();
    });
  });

  describe('checkOnTelemetry', () => {
    it('emits safety commands returned by the detection service', () => {
      mockDetectionService.detectSafetyCommands.mockReturnValue([
        { deviceId: 'DEV-A-101', actuatorType: 'relay', triggerReason: 'mcb_trip' },
      ]);

      service.checkOnTelemetry('DEV-A-101', 'A-101', 1500, 0, 220, 100, 50, true, true);

      expect(mockMqttClient.emit).toHaveBeenCalledWith(
        'device/DEV-A-101/command',
        expect.any(Buffer),
      );
    });

    it('does not re-emit safety commands within the cooldown window', () => {
      mockDetectionService.detectSafetyCommands.mockReturnValue([
        { deviceId: 'DEV-A-101', actuatorType: 'relay', triggerReason: 'mcb_trip' },
      ]);

      service.checkOnTelemetry('DEV-A-101', 'A-101', 1500, 0, 220, 100, 50, true, true);
      service.checkOnTelemetry('DEV-A-101', 'A-101', 1500, 0, 220, 100, 50, true, true);

      expect(mockMqttClient.emit).toHaveBeenCalledTimes(1);
    });

    it('does not throw when an internal error occurs', () => {
      mockDetectionService.detectSafetyCommands.mockImplementation(() => {
        throw new Error('Unexpected failure');
      });

      expect(() =>
        service.checkOnTelemetry('DEV-A-101', 'A-101', 200, 0.5, 220, 100, 50, true, true),
      ).not.toThrow();
    });
  });

  describe('checkOfflineUnits', () => {
    it('saves a device_offline anomaly to DB for offline devices', async () => {
      jest.useRealTimers();
      const offlineTime = new Date(Date.now() - CFG.offlineThresholdMs - 60_000);
      mockMeterReadingRepo.findOne.mockResolvedValue(makeReading({ time: offlineTime }));
      mockAnomalyRepo.findOne.mockResolvedValue(null);

      await service['checkOfflineUnits']();

      expect(mockAnomalyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'device_offline' }),
      );
    });

    it('does not save duplicate anomaly if one already exists in DB', async () => {
      jest.useRealTimers();
      const offlineTime = new Date(Date.now() - CFG.offlineThresholdMs - 60_000);
      mockMeterReadingRepo.findOne.mockResolvedValue(makeReading({ time: offlineTime }));
      mockAnomalyRepo.findOne.mockResolvedValue({ id: 1, type: 'device_offline', resolved_at: null });

      await service['checkOfflineUnits']();

      expect(mockAnomalyRepo.save).not.toHaveBeenCalled();
    });

    it('sends batched admin offline notification after processing all units', async () => {
      jest.useRealTimers();
      const offlineTime = new Date(Date.now() - CFG.offlineThresholdMs - 60_000);
      mockMeterReadingRepo.findOne.mockResolvedValue(makeReading({ time: offlineTime }));
      mockAnomalyRepo.findOne.mockResolvedValue(null);
      mockUnitService.streamAllWithDevice.mockImplementation(async function* () {
        yield [
          makeUnit({ device_id: 'DEV-A-101', unit_no: 'A-101' }),
          makeUnit({ device_id: 'DEV-A-102', unit_no: 'A-102' }),
        ];
      });

      await service['checkOfflineUnits']();

      expect(mockNotificationService.notifyAdminsOfOfflineUnits).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ unitNumber: 'A-101' }),
          expect.objectContaining({ unitNumber: 'A-102' }),
        ]),
      );
    });

    it('does not call notifyAdminsOfOfflineUnits when no units newly went offline', async () => {
      jest.useRealTimers();
      const recentTime = new Date(Date.now() - 60_000);
      mockMeterReadingRepo.findOne.mockResolvedValue(makeReading({ time: recentTime }));

      await service['checkOfflineUnits']();

      expect(mockNotificationService.notifyAdminsOfOfflineUnits).not.toHaveBeenCalled();
    });
  });

  describe('pruneMaps', () => {
    it('removes stale entries from timestamp maps after 24 hours', () => {
      jest.useRealTimers();
      const staleTimestamp = Date.now() - CFG.memoryPruneAgeMs - 1;
      service['lastTelemetryArrivalMs'].set('A-101', staleTimestamp);
      service['lastTelemetryRefreshMs'].set('A-101', staleTimestamp);
      service['lastSafetyCommandMs'].set('DEV-A-101', staleTimestamp);

      service['pruneMaps']();

      expect(service['lastTelemetryArrivalMs'].has('A-101')).toBe(false);
      expect(service['lastTelemetryRefreshMs'].has('A-101')).toBe(false);
      expect(service['lastSafetyCommandMs'].has('DEV-A-101')).toBe(false);
    });

    it('retains recent entries in timestamp maps', () => {
      jest.useRealTimers();
      const recentTimestamp = Date.now() - 60_000;
      service['lastTelemetryArrivalMs'].set('A-101', recentTimestamp);

      service['pruneMaps']();

      expect(service['lastTelemetryArrivalMs'].has('A-101')).toBe(true);
    });

    it('clears anomaly cache when it exceeds the maximum size', () => {
      jest.useRealTimers();
      for (let index = 0; index <= CFG.anomalyCacheMaxSize; index++) {
        service['anomalyCache'].set(`unit-${index}`, []);
      }

      service['pruneMaps']();

      expect(service['anomalyCache'].size).toBe(0);
    });
  });
});
