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

function makeReadings(count: number, overrides: Partial<MeterReading> = {}): MeterReading[] {
  return Array.from({ length: count }, () => makeReading(overrides));
}

function makeUnit(overrides: Partial<any> = {}) {
  return {
    id: 1,
    unit_no: 'A-101',
    device_id: 'DEV-A-101',
    token_electricity: 100,
    token_water: 50,
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
      streamAllWithDevice: jest.fn().mockImplementation(async function* () {
        yield [makeUnit()];
      }),
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
      sendTelegram: jest.fn().mockResolvedValue(undefined),
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

  describe('low_token', () => {
    it('triggers when token_electricity is < 5', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ token_electricity: 3 }));
      const results = await service['computeAll']('A-101');
      expect(results.some((a) => a.anomalyType === 'low_token')).toBe(true);
    });

    it('triggers when token_water is < 1', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ token_water: 0.5 }));
      const results = await service['computeAll']('A-101');
      expect(results.some((a) => a.anomalyType === 'low_token')).toBe(true);
    });
  });

  describe('jailbreak', () => {
    it('triggers when tokens are 0, relay OFF, but power > 5W', async () => {
      mockUnitService.findByUnitNo.mockResolvedValue(makeUnit({ token_electricity: 0, relay_status: false }));
      mockMeterRepo.find.mockResolvedValue([makeReading({ power: 100 })]);

      const results = await service['computeAll']('A-101');
      expect(results.some((a) => a.anomalyType === 'jailbreak')).toBe(true);
    });
  });

  describe('checkOfflineUnits', () => {
    it('saves anomaly to DB for offline devices', async () => {
      jest.useRealTimers();
      mockUnitService.streamAllWithDevice.mockImplementation(async function* () {
        yield [makeUnit({ device_id: 'DEV-OFFLINE', unit_no: 'A-101' })];
      });
      // Last reading 15 mins ago
      mockMeterRepo.findOne.mockResolvedValue(makeReading({ time: new Date(Date.now() - 15 * 60_000) }));
      mockAnomalyRepo.findOne.mockResolvedValue(null);

      await service['checkOfflineUnits']();

      expect(mockAnomalyRepo.save).toHaveBeenCalled();
    });

    it('sends one admin summary when multiple units go offline', async () => {
      jest.useRealTimers();
      mockUnitService.streamAllWithDevice.mockImplementation(async function* () {
        yield [
          makeUnit({ device_id: 'DEV-A-101', unit_no: 'A-101' }),
          makeUnit({ device_id: 'DEV-A-102', unit_no: 'A-102' }),
        ];
      });
      mockMeterRepo.findOne.mockResolvedValue(
        makeReading({ time: new Date(Date.now() - 15 * 60_000) }),
      );
      mockAnomalyRepo.findOne.mockResolvedValue(null);
      mockResidentsService.findAdmins.mockResolvedValue([
        { telegram_chat_id: 'admin-chat' },
      ]);

      await service['checkOfflineUnits']();
      await Promise.resolve();

      expect(mockNotificationService.sendTelegram).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.sendTelegram).toHaveBeenCalledWith(
        'admin-chat',
        expect.stringContaining('2 unit offline: A-101, A-102'),
      );
    });
  });

  describe('syncAnomaliesToDb', () => {
    it('caches admins and cools down repeated admin alerts by anomaly type', async () => {
      jest.useRealTimers();
      mockResidentsService.findAdmins.mockResolvedValue([
        { telegram_chat_id: 'admin-chat' },
      ]);
      const voltageAnomaly = {
        anomalyType: 'voltage_anomaly',
        severity: 'warning',
        target: 'both',
        message: 'Voltage dip',
        metadata: {},
        detectedAt: new Date().toISOString(),
      };

      await service['syncAnomaliesToDb']('A-101', [voltageAnomaly]);
      await service['syncAnomaliesToDb']('A-102', [voltageAnomaly]);

      expect(mockResidentsService.findAdmins).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.sendTelegram).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkOnTelemetry', () => {
    it('emits relay OFF for safety when power > MCB limit', () => {
      service.checkOnTelemetry('DEV-A-101', 'A-101', 1500, 0, 220, 100, 50, true);
      expect(mockMqttClient.emit).toHaveBeenCalled();
    });

    it('emits relay OFF for safety during jailbreak', () => {
      // Tokens 0, relay status is supposed to be OFF (false), but it's drawing 100W
      service.checkOnTelemetry('DEV-A-101', 'A-101', 100, 0, 220, 0, 0, false);
      expect(mockMqttClient.emit).toHaveBeenCalled();
    });
  });
});
