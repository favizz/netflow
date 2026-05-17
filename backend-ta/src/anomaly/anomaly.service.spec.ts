/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnomalyService } from './anomaly.service';
import { MeterReading } from '../device/entities/device.entity';
import { Anomaly } from './entities/anomaly.entity';
import { UnitService } from '../unit/unit.service';
import { NotificationService } from '../notification/notification.service';
import { ResidentsService } from '../residents/residents.service';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeReading(overrides: Partial<MeterReading> = {}): MeterReading {
  return {
    time: new Date(Date.now() - 60_000), // 1 minute ago (online)
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

function makeReadings(count: number, overrides: Partial<MeterReading> = {}): MeterReading[] {
  return Array.from({ length: count }, () => makeReading(overrides));
}

function makeUnit(overrides: Partial<any> = {}) {
  return {
    id: 1,
    unit_no: 'A-101',
    device_id: 'DEV-A-101',
    balance: 50_000,
    relay_status: true,
    resident_email: 'resident@test.com',
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AnomalyService', () => {
  let service: AnomalyService;
  let mockUnitService: any;
  let mockMeterRepo: any;
  let mockAnomalyRepo: any;
  let mockMqttClient: any;
  let mockNotificationService: any;
  let mockResidentsService: any;

  beforeEach(async () => {
    jest.useFakeTimers();

    mockUnitService = {
      findAll: jest.fn().mockResolvedValue([]),
      findByUnitNo: jest.fn().mockResolvedValue(makeUnit()),
    };

    mockMeterRepo = {
      find: jest.fn().mockResolvedValue([makeReading()]),
      findOne: jest.fn().mockResolvedValue(makeReading()),
    };

    mockAnomalyRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };

    mockMqttClient = { emit: jest.fn() };

    mockNotificationService = {
      sendResidentNotification: jest.fn().mockResolvedValue(undefined),
    };

    mockResidentsService = {
      findAdmins: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnomalyService,
        { provide: UnitService, useValue: mockUnitService },
        { provide: getRepositoryToken(MeterReading), useValue: mockMeterRepo },
        { provide: getRepositoryToken(Anomaly), useValue: mockAnomalyRepo },
        { provide: 'MQTT_CLIENT', useValue: mockMqttClient },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ResidentsService, useValue: mockResidentsService },
      ],
    }).compile();

    service = module.get<AnomalyService>(AnomalyService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Cache & filter ────────────────────────────────────────────────────────────

  describe('getAnomaliesForUnit', () => {
    it('filters out admin-only anomalies from resident view', async () => {
      // device_offline has target: 'admin' - should be filtered out
      mockMeterRepo.find.mockResolvedValue([
        makeReading({ time: new Date(Date.now() - 11 * 60_000) }),
      ]);

      const results = await service.getAnomaliesForUnit('A-101');

      expect(results.every((a) => a.target !== 'admin')).toBe(true);
    });

    it('returns from cache on second call without re-querying DB', async () => {
      await service.getAnomaliesForUnit('A-101');
      await service.getAnomaliesForUnit('A-101');

      expect(mockUnitService.findByUnitNo).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAllAnomaliesForUnit', () => {
    it('includes admin-only anomalies (e.g. device_offline)', async () => {
      mockMeterRepo.find.mockResolvedValue([
        makeReading({ time: new Date(Date.now() - 11 * 60_000) }),
      ]);

      const results = await service.getAllAnomaliesForUnit('A-101');

      expect(results.some((a) => a.target === 'admin')).toBe(true);
    });

    it('always recomputes on each call to return fresh results', async () => {
      await service.getAllAnomaliesForUnit('A-101');
      await service.getAllAnomaliesForUnit('A-101');

      expect(mockUnitService.findByUnitNo).toHaveBeenCalledTimes(2);
    });
  });

  // ── device_offline ────────────────────────────────────────────────────────────

  describe('device_offline', () => {
    it('triggers when last reading is older than 10 minutes', async () => {
      mockMeterRepo.find.mockResolvedValue([
        makeReading({ time: new Date(Date.now() - 11 * 60_000) }),
      ]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'device_offline')).toBe(true);
    });

    it('is severity critical', async () => {
      mockMeterRepo.find.mockResolvedValue([
        makeReading({ time: new Date(Date.now() - 11 * 60_000) }),
      ]);

      const results = await service['computeAll']('A-101');
      const item = results.find((a) => a.anomalyType === 'device_offline')!;

      expect(item.severity).toBe('critical');
    });

    it('is target admin-only', async () => {
      mockMeterRepo.find.mockResolvedValue([
        makeReading({ time: new Date(Date.now() - 11 * 60_000) }),
      ]);

      const results = await service['computeAll']('A-101');
      const item = results.find((a) => a.anomalyType === 'device_offline')!;

      expect(item.target).toBe('admin');
    });

    it('triggers when there are no readings at all', async () => {
      mockMeterRepo.find.mockResolvedValue([]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'device_offline')).toBe(true);
    });

    it('does NOT trigger when last reading is within 10 minutes', async () => {
      mockMeterRepo.find.mockResolvedValue([
        makeReading({ time: new Date(Date.now() - 5 * 60_000) }),
      ]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'device_offline')).toBe(false);
    });

    it('returns early and skips remaining checks when device is offline', async () => {
      mockMeterRepo.find.mockResolvedValue([]);

      const results = await service['computeAll']('A-101');

      // When offline, only device_offline (and possibly low_balance) should appear
      const types = results.map((a) => a.anomalyType);
      expect(types.every((t) => t === 'device_offline' || t === 'low_balance')).toBe(true);
    });
  });

  // ── low_balance ───────────────────────────────────────────────────────────────

  describe('low_balance', () => {
    it('triggers when balance is between 0 and 20000', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ balance: 10_000 }));

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'low_balance')).toBe(true);
    });

    it('is severity warning', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ balance: 5_000 }));

      const results = await service['computeAll']('A-101');
      const item = results.find((a) => a.anomalyType === 'low_balance')!;

      expect(item.severity).toBe('warning');
    });

    it('is target resident-only', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ balance: 5_000 }));

      const results = await service['computeAll']('A-101');
      const item = results.find((a) => a.anomalyType === 'low_balance')!;

      expect(item.target).toBe('resident');
    });

    it('does NOT trigger when balance is exactly 0', async () => {
      // balance > 0 check fails - no low_balance when already drained
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ balance: 0 }));

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'low_balance')).toBe(false);
    });

    it('does NOT trigger when balance is at the threshold (20000)', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ balance: 20_000 }));

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'low_balance')).toBe(false);
    });
  });

  // ── sensor_malfunction ───────────────────────────────────────────────────────

  describe('sensor_malfunction', () => {
    const nullReadings = () =>
      makeReadings(10, { power: null as any, voltage: null as any, water_flow: null as any });

    it('triggers when 5+ of the last 10 readings are all null', async () => {
      mockMeterRepo.find.mockResolvedValue(nullReadings());

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'sensor_malfunction')).toBe(true);
    });

    it('short-circuits: no further anomalies are checked after sensor_malfunction', async () => {
      mockMeterRepo.find.mockResolvedValue(nullReadings());

      const results = await service['computeAll']('A-101');
      const types = results.map((a) => a.anomalyType);

      expect(types).not.toContain('mcb_trip');
      expect(types).not.toContain('voltage_anomaly');
      expect(types).not.toContain('backflow');
    });

    it('does NOT trigger with fewer than 5 readings available', async () => {
      mockMeterRepo.find.mockResolvedValue(
        makeReadings(3, { power: null as any, voltage: null as any, water_flow: null as any }),
      );

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'sensor_malfunction')).toBe(false);
    });

    it('does NOT trigger when at least one reading has a value', async () => {
      const mixed = [
        makeReading({ power: 200 }), // valid
        ...makeReadings(9, { power: null as any, voltage: null as any, water_flow: null as any }),
      ];
      mockMeterRepo.find.mockResolvedValue(mixed);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'sensor_malfunction')).toBe(false);
    });
  });

  // ── backflow ──────────────────────────────────────────────────────────────────

  describe('backflow', () => {
    it('does not have a dedicated backflow detector (no anomaly produced for negative flow)', async () => {
      mockMeterRepo.find.mockResolvedValue([makeReading({ water_flow: -0.5 })]);

      const results = await service['computeAll']('A-101');

      // The current service does not implement backflow detection
      expect(results.some((a) => (a.anomalyType as string) === 'backflow')).toBe(false);
    });
  });

  // ── jailbreak ─────────────────────────────────────────────────────────────────

  describe('jailbreak', () => {
    it('triggers when balance <= 0, relay OFF, and power > 5W', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ balance: 0, relay_status: false }));
      mockMeterRepo.find.mockResolvedValue([makeReading({ power: 100, water_flow: 0 })]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'jailbreak')).toBe(true);
    });

    it('triggers when balance <= 0, relay OFF, and flow > 0.1', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ balance: 0, relay_status: false }));
      mockMeterRepo.find.mockResolvedValue([makeReading({ power: 0, water_flow: 0.5 })]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'jailbreak')).toBe(true);
    });

    it('is severity critical and target admin', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ balance: 0, relay_status: false }));
      mockMeterRepo.find.mockResolvedValue([makeReading({ power: 100 })]);

      const results = await service['computeAll']('A-101');
      const item = results.find((a) => a.anomalyType === 'jailbreak')!;

      expect(item.severity).toBe('critical');
      expect(item.target).toBe('admin');
    });

    it('does NOT trigger when balance is still positive', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ balance: 1, relay_status: false }));
      mockMeterRepo.find.mockResolvedValue([makeReading({ power: 100 })]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'jailbreak')).toBe(false);
    });

    it('does NOT trigger when relay is ON', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ balance: 0, relay_status: true }));
      mockMeterRepo.find.mockResolvedValue([makeReading({ power: 100 })]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'jailbreak')).toBe(false);
    });
  });

  // ── mcb_trip ──────────────────────────────────────────────────────────────────

  describe('mcb_trip', () => {
    it('triggers when power exceeds 1300W', async () => {
      mockMeterRepo.find.mockResolvedValue([makeReading({ power: 1400 })]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'mcb_trip')).toBe(true);
    });

    it('is severity critical', async () => {
      mockMeterRepo.find.mockResolvedValue([makeReading({ power: 1400 })]);

      const results = await service['computeAll']('A-101');
      const item = results.find((a) => a.anomalyType === 'mcb_trip')!;

      expect(item.severity).toBe('critical');
    });

    it('does NOT trigger at exactly 1300W (boundary is exclusive)', async () => {
      mockMeterRepo.find.mockResolvedValue([makeReading({ power: 1300 })]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'mcb_trip')).toBe(false);
    });
  });

  // ── voltage_anomaly ──────────────────────────────────────────────────────────

  describe('voltage_anomaly', () => {
    it('triggers warning when voltage is slightly below safe range (197V)', async () => {
      mockMeterRepo.find.mockResolvedValue([makeReading({ voltage: 197 })]);

      const results = await service['computeAll']('A-101');
      const item = results.find((a) => a.anomalyType === 'voltage_anomaly')!;

      expect(item).toBeDefined();
      expect(item.severity).toBe('warning');
    });

    it('triggers critical when voltage is critically low (< 180V)', async () => {
      mockMeterRepo.find.mockResolvedValue([makeReading({ voltage: 179 })]);

      const results = await service['computeAll']('A-101');
      const item = results.find((a) => a.anomalyType === 'voltage_anomaly')!;

      expect(item.severity).toBe('critical');
    });

    it('triggers warning when voltage is slightly above safe range (243V)', async () => {
      mockMeterRepo.find.mockResolvedValue([makeReading({ voltage: 243 })]);

      const results = await service['computeAll']('A-101');
      const item = results.find((a) => a.anomalyType === 'voltage_anomaly')!;

      expect(item).toBeDefined();
      expect(item.severity).toBe('warning');
    });

    it('triggers critical when voltage is critically high (> 250V)', async () => {
      mockMeterRepo.find.mockResolvedValue([makeReading({ voltage: 251 })]);

      const results = await service['computeAll']('A-101');
      const item = results.find((a) => a.anomalyType === 'voltage_anomaly')!;

      expect(item.severity).toBe('critical');
    });

    it('does NOT trigger at normal voltage (220V)', async () => {
      mockMeterRepo.find.mockResolvedValue([makeReading({ voltage: 220 })]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'voltage_anomaly')).toBe(false);
    });

    it('does NOT trigger at the safe lower boundary (198V)', async () => {
      mockMeterRepo.find.mockResolvedValue([makeReading({ voltage: 198 })]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'voltage_anomaly')).toBe(false);
    });

    it('does NOT trigger at the safe upper boundary (242V)', async () => {
      mockMeterRepo.find.mockResolvedValue([makeReading({ voltage: 242 })]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'voltage_anomaly')).toBe(false);
    });
  });

  // ── low_power_factor ─────────────────────────────────────────────────────────

  describe('low_power_factor', () => {
    it('triggers when PF < 0.6 with sufficient power and current', async () => {
      // PF = P / (V × I) = 100 / (220 × 1.0) = 0.45 → low
      mockMeterRepo.find.mockResolvedValue([
        makeReading({ power: 100, voltage: 220, current: 1.0 }),
      ]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'low_power_factor')).toBe(true);
    });

    it('does NOT trigger when power is at or below 50W guard', async () => {
      mockMeterRepo.find.mockResolvedValue([
        makeReading({ power: 50, voltage: 220, current: 2.0 }),
      ]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'low_power_factor')).toBe(false);
    });

    it('does NOT trigger when current is at or below 0.1A guard', async () => {
      mockMeterRepo.find.mockResolvedValue([
        makeReading({ power: 200, voltage: 220, current: 0.1 }),
      ]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'low_power_factor')).toBe(false);
    });

    it('does NOT trigger at normal power factor', async () => {
      // PF = 200 / (220 × 1.0) = 0.91 → healthy
      mockMeterRepo.find.mockResolvedValue([
        makeReading({ power: 200, voltage: 220, current: 1.0 }),
      ]);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'low_power_factor')).toBe(false);
    });
  });

  // ── usage_spike ──────────────────────────────────────────────────────────────

  describe('usage_spike', () => {
    // Builds 10 readings: first = current, rest = baseline
    function makeSpikeReadings(currentPower: number, baselinePower: number): MeterReading[] {
      return [
        makeReading({ power: currentPower }),
        ...Array.from({ length: 9 }, () => makeReading({ power: baselinePower })),
      ];
    }

    it('triggers when current power > 3× baseline AND > 500W', async () => {
      // baseline = 200W avg, current = 700W → 700 > 600 and 700 > 500
      mockMeterRepo.find.mockResolvedValue(makeSpikeReadings(700, 200));

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'usage_spike')).toBe(true);
    });

    it('does NOT trigger when current power is below 500W even if > 3× baseline', async () => {
      // baseline = 110W, current = 400W → 400 > 330 but 400 < 500
      mockMeterRepo.find.mockResolvedValue(makeSpikeReadings(400, 110));

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'usage_spike')).toBe(false);
    });

    it('does NOT trigger when baseline is below 100W guard', async () => {
      // baseline = 50W, current = 700W → 700 > 150 but baseline guard fails
      mockMeterRepo.find.mockResolvedValue(makeSpikeReadings(700, 50));

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'usage_spike')).toBe(false);
    });

    it('does NOT trigger with fewer than 10 power readings', async () => {
      mockMeterRepo.find.mockResolvedValue(makeSpikeReadings(700, 200).slice(0, 7));

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'usage_spike')).toBe(false);
    });
  });

  // ── zero_flow ─────────────────────────────────────────────────────────────────

  describe('zero_flow', () => {
    it('does not have a dedicated zero_flow detector (no anomaly produced)', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ relay_status: true, balance: 50_000 }));
      mockMeterRepo.find.mockResolvedValue(makeReadings(20, { water_flow: 0 }));

      const results = await service['computeAll']('A-101');

      // The current service does not implement zero_flow detection
      expect(results.some((a) => (a.anomalyType as string) === 'zero_flow')).toBe(false);
    });
  });

  // ── water_leak ────────────────────────────────────────────────────────────────

  describe('detectWaterLeak', () => {
    it('triggers with perfectly constant flow above 0.3 L/min (CoV = 0)', async () => {
      mockMeterRepo.find.mockResolvedValue(makeReadings(30, { water_flow: 0.5 }));

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'water_leak')).toBe(true);
    });

    it('does NOT trigger with fewer than 30 readings', async () => {
      mockMeterRepo.find.mockResolvedValue(makeReadings(29, { water_flow: 0.5 }));

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'water_leak')).toBe(false);
    });

    it('does NOT trigger when mean flow is below 0.3 L/min', async () => {
      mockMeterRepo.find.mockResolvedValue(makeReadings(30, { water_flow: 0.2 }));

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'water_leak')).toBe(false);
    });

    it('does NOT trigger when flow has high variance (CoV >= 0.2)', async () => {
      // Alternating 0.1 and 2.0 → high CoV
      const readings = Array.from({ length: 30 }, (_, i) =>
        makeReading({ water_flow: i % 2 === 0 ? 0.1 : 2.0 }),
      );
      mockMeterRepo.find.mockResolvedValue(readings);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'water_leak')).toBe(false);
    });

    it('does NOT trigger when fewer than 90% of readings have non-zero flow', async () => {
      // 25 readings with flow, 5 with zero → 83% non-zero < 90%
      const readings = [
        ...makeReadings(25, { water_flow: 0.5 }),
        ...makeReadings(5, { water_flow: 0 }),
      ];
      mockMeterRepo.find.mockResolvedValue(readings);

      const results = await service['computeAll']('A-101');

      expect(results.some((a) => a.anomalyType === 'water_leak')).toBe(false);
    });
  });

  // ── checkOnTelemetry - safety cutoffs ────────────────────────────────────────

  describe('checkOnTelemetry - safety cutoffs', () => {
    it('emits relay=0 when balance <= 0, relay OFF, and power > 5W', () => {
      service.checkOnTelemetry('DEV-A-101', 'A-101', 100, 0, 220, 0, false);

      expect(mockMqttClient.emit).toHaveBeenCalledWith(
        'device/DEV-A-101/command',
        expect.any(Buffer),
      );
    });

    it('emits relay=0 when balance <= 0, relay OFF, and flow > 0.1 L/min', () => {
      service.checkOnTelemetry('DEV-A-101', 'A-101', 0, 0.5, 220, 0, false);

      expect(mockMqttClient.emit).toHaveBeenCalledWith(
        'device/DEV-A-101/command',
        expect.any(Buffer),
      );
    });

    it('emits relay=0 when power exceeds MCB limit (1300W)', () => {
      service.checkOnTelemetry('DEV-A-101', 'A-101', 1400, 0.5, 220, 50_000, true);

      expect(mockMqttClient.emit).toHaveBeenCalledWith(
        'device/DEV-A-101/command',
        expect.any(Buffer),
      );
    });

    it('emits relay=0 when voltage exceeds critical high (250V)', () => {
      service.checkOnTelemetry('DEV-A-101', 'A-101', 200, 0.5, 251, 50_000, true);

      expect(mockMqttClient.emit).toHaveBeenCalledWith(
        'device/DEV-A-101/command',
        expect.any(Buffer),
      );
    });

    it('does NOT emit relay command under normal conditions', () => {
      service.checkOnTelemetry('DEV-A-101', 'A-101', 200, 0.5, 220, 50_000, true);

      expect(mockMqttClient.emit).not.toHaveBeenCalled();
    });

    it('does NOT emit relay cutoff when balance > 0 even if relay is OFF', () => {
      service.checkOnTelemetry('DEV-A-101', 'A-101', 100, 0, 220, 1_000, false);

      expect(mockMqttClient.emit).not.toHaveBeenCalled();
    });
  });

  // ── checkOnTelemetry - throttle ──────────────────────────────────────────────

  describe('checkOnTelemetry - throttle (30s)', () => {
    it('triggers recompute on first call', () => {
      const spy = jest.spyOn(service as any, 'computeAll').mockResolvedValue([]);

      service.checkOnTelemetry('DEV-A-101', 'A-101', 200, 0.5, 220, 50_000, true);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does NOT recompute on a second call within 30 seconds', () => {
      const spy = jest.spyOn(service as any, 'computeAll').mockResolvedValue([]);

      service.checkOnTelemetry('DEV-A-101', 'A-101', 200, 0.5, 220, 50_000, true);
      service.checkOnTelemetry('DEV-A-101', 'A-101', 200, 0.5, 220, 50_000, true);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('recomputes again after the 30-second window has passed', () => {
      const spy = jest.spyOn(service as any, 'computeAll').mockResolvedValue([]);

      service.checkOnTelemetry('DEV-A-101', 'A-101', 200, 0.5, 220, 50_000, true);
      jest.advanceTimersByTime(31_000);
      service.checkOnTelemetry('DEV-A-101', 'A-101', 200, 0.5, 220, 50_000, true);

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('throttles independently per unit', () => {
      const spy = jest.spyOn(service as any, 'computeAll').mockResolvedValue([]);

      service.checkOnTelemetry('DEV-A-101', 'A-101', 200, 0.5, 220, 50_000, true);
      service.checkOnTelemetry('DEV-B-101', 'B-101', 200, 0.5, 220, 50_000, true);

      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  // ── syncAnomaliesToDb ────────────────────────────────────────────────────────

  describe('syncAnomaliesToDb', () => {
    const newAnomaly = () => ({
      anomalyType: 'mcb_trip' as const,
      severity: 'critical' as const,
      target: 'both' as const,
      message: 'Power exceeded MCB limit: 1400 W',
      metadata: { power_w: 1400 },
      detectedAt: new Date().toISOString(),
    });

    it('inserts a new anomaly when it is not yet active in DB', async () => {
      mockAnomalyRepo.find.mockResolvedValue([]);

      await service['syncAnomaliesToDb']('A-101', [newAnomaly()]);

      expect(mockAnomalyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'mcb_trip', device_id: 'DEV-A-101' }),
      );
    });

    it('sends email notification when a new critical anomaly is detected', async () => {
      mockAnomalyRepo.find.mockResolvedValue([]);

      await service['syncAnomaliesToDb']('A-101', [newAnomaly()]);

      expect(mockNotificationService.sendResidentNotification).toHaveBeenCalledWith(
        'resident@test.com',
        expect.stringContaining('MCB_TRIP'),
        expect.any(String),
      );
    });

    it('does NOT send email when unit has no resident email', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ resident_email: null }));
      mockAnomalyRepo.find.mockResolvedValue([]);

      await service['syncAnomaliesToDb']('A-101', [newAnomaly()]);

      expect(mockNotificationService.sendResidentNotification).not.toHaveBeenCalled();
    });

    it('sets resolved_at when a previously active anomaly is no longer detected', async () => {
      const activeAnomaly = { type: 'mcb_trip', resolved_at: null };
      mockAnomalyRepo.find.mockResolvedValue([activeAnomaly]);

      await service['syncAnomaliesToDb']('A-101', []); // empty = all cleared

      expect(mockAnomalyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ resolved_at: expect.any(Date) }),
      );
    });

    it('does NOT insert a duplicate when anomaly is already active in DB', async () => {
      const activeAnomaly = { type: 'mcb_trip', resolved_at: null };
      mockAnomalyRepo.find.mockResolvedValue([activeAnomaly]);

      await service['syncAnomaliesToDb']('A-101', [newAnomaly()]);

      // save not called: anomaly already active, no new insert, no resolve needed
      expect(mockAnomalyRepo.save).not.toHaveBeenCalled();
    });

    it('handles multiple anomalies: inserts new and resolves cleared ones in the same pass', async () => {
      const activeAnomaly = { type: 'backflow', resolved_at: null };
      mockAnomalyRepo.find.mockResolvedValue([activeAnomaly]);

      await service['syncAnomaliesToDb']('A-101', [newAnomaly()]); // mcb_trip new, backflow cleared

      const saveCalls = mockAnomalyRepo.save.mock.calls.map((c: any[]) => c[0]);
      expect(saveCalls.some((c: any) => c.type === 'mcb_trip')).toBe(true);
      expect(saveCalls.some((c: any) => c.resolved_at instanceof Date)).toBe(true);
    });
  });

  // ── checkOfflineUnits ─────────────────────────────────────────────────────────

  describe('checkOfflineUnits', () => {
    it('inserts a DB anomaly for offline units that have no active offline record', async () => {
      const units = [makeUnit({ device_id: 'DEV-A-101', unit_no: 'A-101' })];
      mockUnitService.findAll.mockResolvedValue(units);
      // Latest reading is >10 min ago → offline
      mockMeterRepo.findOne.mockResolvedValue(
        makeReading({ time: new Date(Date.now() - 11 * 60_000) }),
      );
      mockAnomalyRepo.findOne.mockResolvedValue(null); // no existing offline record

      await service['checkOfflineUnits']();

      expect(mockAnomalyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'device_offline', device_id: 'DEV-A-101' }),
      );
    });

    it('skips inserting when an active offline record already exists', async () => {
      mockUnitService.findAll.mockResolvedValue([makeUnit()]);
      mockMeterRepo.findOne.mockResolvedValue(
        makeReading({ time: new Date(Date.now() - 11 * 60_000) }),
      );
      mockAnomalyRepo.findOne.mockResolvedValue({ id: 1, type: 'device_offline', resolved_at: null });

      await service['checkOfflineUnits']();

      expect(mockAnomalyRepo.save).not.toHaveBeenCalled();
    });

    it('skips units with no device_id', async () => {
      mockUnitService.findAll.mockResolvedValue([makeUnit({ device_id: null })]);

      await service['checkOfflineUnits']();

      expect(mockMeterRepo.findOne).not.toHaveBeenCalled();
    });

    it('continues processing remaining units when one throws', async () => {
      const units = [
        makeUnit({ device_id: 'DEV-A-1', unit_no: 'A-1' }),
        makeUnit({ device_id: 'DEV-A-2', unit_no: 'A-2' }),
      ];
      mockUnitService.findAll.mockResolvedValue(units);
      mockMeterRepo.findOne
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(makeReading({ time: new Date(Date.now() - 11 * 60_000) }));
      mockAnomalyRepo.findOne.mockResolvedValue(null);

      await expect(service['checkOfflineUnits']()).resolves.not.toThrow();
    });
  });

  // ── resolveOfflineAnomaly ─────────────────────────────────────────────────────

  describe('resolveOfflineAnomaly', () => {
    it('removes device_offline from cache', async () => {
      service['anomalyCache'].set('A-101', [
        { anomalyType: 'device_offline', severity: 'critical', target: 'admin', message: '', metadata: {}, detectedAt: '' },
        { anomalyType: 'low_balance', severity: 'warning', target: 'resident', message: '', metadata: {}, detectedAt: '' },
      ]);
      mockAnomalyRepo.findOne.mockResolvedValue(null);

      await service['resolveOfflineAnomaly']('DEV-A-101', 'A-101');

      const cached = service['anomalyCache'].get('A-101')!;
      expect(cached.some((a) => a.anomalyType === 'device_offline')).toBe(false);
      expect(cached.some((a) => a.anomalyType === 'low_balance')).toBe(true);
    });

    it('sets resolved_at on the active DB anomaly', async () => {
      const activeAnomaly = { id: 1, device_id: 'DEV-A-101', type: 'device_offline', resolved_at: null };
      mockAnomalyRepo.findOne.mockResolvedValue(activeAnomaly);

      await service['resolveOfflineAnomaly']('DEV-A-101', 'A-101');

      expect(mockAnomalyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ resolved_at: expect.any(Date) }),
      );
    });
  });
});
