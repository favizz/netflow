/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DeviceService } from './device.service';
import { MeterReading } from './entities/device.entity';
import { Unit } from '../unit/entities/unit.entity';
import { AnomalyService } from '../anomaly/anomaly.service';
import { TariffService } from '../tariff/tariff.service';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 1,
    unit_no: 'A-101',
    device_id: 'DEV-A-101',
    building_id: 1,
    resident_email: 'test@example.com',
    balance: 50_000,
    relay_status: true,
    valve_status: true,
    last_energy_reading: 100,
    last_water_reading: 10,
    created_at: new Date(),
    ...overrides,
  } as Unit;
}

function makeQueryRunner(unit: Unit) {
  const savedUnit = { ...unit };
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn().mockResolvedValue(savedUnit),
      save: jest.fn().mockImplementation((entity: any) => {
        if (entity && entity.unit_no) Object.assign(savedUnit, entity);
        return Promise.resolve(entity);
      }),
      create: jest.fn().mockImplementation((_, data) => ({ ...data })),
    },
  };
  return { queryRunner, savedUnit };
}

// ── Test setup ────────────────────────────────────────────────────────────────

let service: DeviceService;
let mockMqttClient: { emit: jest.Mock };
let mockAnomalyService: { checkOnTelemetry: jest.Mock };
let mockTariffService: { findCurrent: jest.Mock };
let mockDataSource: { createQueryRunner: jest.Mock };

async function buildModule(unit: Unit): Promise<{ qr: ReturnType<typeof makeQueryRunner>['queryRunner'] }> {
  const { queryRunner, savedUnit } = makeQueryRunner(unit);
  mockDataSource = { createQueryRunner: jest.fn().mockReturnValue(queryRunner) };
  mockMqttClient = { emit: jest.fn() };
  mockAnomalyService = { checkOnTelemetry: jest.fn().mockResolvedValue(undefined) };
  mockTariffService = {
    findCurrent: jest.fn().mockImplementation((type: string) =>
      type === 'electricity' ? 1444.7 : 5000,
    ),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DeviceService,
      { provide: getRepositoryToken(MeterReading), useValue: {} },
      { provide: DataSource, useValue: mockDataSource },
      { provide: 'MQTT_CLIENT', useValue: mockMqttClient },
      { provide: AnomalyService, useValue: mockAnomalyService },
      { provide: TariffService, useValue: mockTariffService },
    ],
  }).compile();

  service = module.get(DeviceService);
  return { qr: queryRunner };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeviceService.saveSensorData', () => {
  describe('balance deduction', () => {
    it('deducts electricity cost from balance when energy delta > 0', async () => {
      const unit = makeUnit({ balance: 50_000, last_energy_reading: 100, last_water_reading: 10 });
      const { qr } = await buildModule(unit);

      // Delta = 0.5 kWh, cost = 0.5 × 1444.70 = 722.35
      await service.saveSensorData({
        _deviceId: 'DEV-A-101',
        et: 100.5, wt: 10, p: 500, v: 220, c: 2.27, wf: 0, b: null,
      });

      const savedCall = (qr.manager.save as jest.Mock).mock.calls.find(
        ([arg]: [any]) => arg && typeof arg.balance !== 'undefined' && !arg.time,
      );
      expect(savedCall).toBeDefined();
      const savedUnit = savedCall[0];
      expect(Number(savedUnit.balance)).toBeCloseTo(50_000 - 722.35, 0);
    });

    it('deducts water cost when water delta > 0', async () => {
      const unit = makeUnit({ balance: 30_000, last_energy_reading: 100, last_water_reading: 10 });
      await buildModule(unit);

      // Delta = 0.1 m³, cost = 0.1 × 5000 = 500
      await service.saveSensorData({
        _deviceId: 'DEV-A-101',
        et: 100, wt: 10.1, p: 0, v: 220, c: 0, wf: 1.5, b: null,
      });

      const savedCall = (mockDataSource.createQueryRunner().manager.save as jest.Mock).mock.calls.find(
        ([arg]: [any]) => arg && typeof arg.balance !== 'undefined' && !arg.time,
      );
      const savedUnit = savedCall?.[0];
      expect(Number(savedUnit?.balance)).toBeCloseTo(30_000 - 500, 0);
    });

    it('does not change balance when there is no energy/water delta', async () => {
      const unit = makeUnit({ balance: 50_000, last_energy_reading: 100, last_water_reading: 10 });
      const { qr } = await buildModule(unit);

      await service.saveSensorData({
        _deviceId: 'DEV-A-101',
        et: 100, wt: 10, p: 200, v: 220, c: 0.9, wf: 0, b: null,
      });

      // The unit is always saved (for last_seen tracking), but balance must stay unchanged
      const savedUnitCall = (qr.manager.save as jest.Mock).mock.calls.find(
        ([arg]: [any]) => arg && typeof arg.balance !== 'undefined' && !arg.time,
      );
      if (savedUnitCall) {
        expect(Number(savedUnitCall[0].balance)).toBe(50_000);
      }
      // No MQTT relay cut should have been emitted
      expect(mockMqttClient.emit).not.toHaveBeenCalled();
    });
  });

  describe('relay cutoff on zero balance', () => {
    it('emits relay OFF and valve OFF MQTT commands when balance hits zero', async () => {
      // Balance just enough to get cut on next reading
      const unit = makeUnit({ balance: 100, last_energy_reading: 100, last_water_reading: 10, relay_status: true, valve_status: true });
      await buildModule(unit);

      // 0.1 kWh delta = 144.47 cost → balance goes negative
      await service.saveSensorData({
        _deviceId: 'DEV-A-101',
        et: 100.1, wt: 10, p: 1000, v: 220, c: 4.5, wf: 0, b: null,
      });

      expect(mockMqttClient.emit).toHaveBeenCalledWith(
        'device/DEV-A-101/command',
        expect.any(Buffer),
      );
    });

    it('saves meter reading row regardless of balance state', async () => {
      const unit = makeUnit({ balance: 0, relay_status: false });
      const { qr } = await buildModule(unit);

      await service.saveSensorData({
        _deviceId: 'DEV-A-101',
        et: 100, wt: 10, p: 0, v: 220, c: 0, wf: 0, b: null,
      });

      const meterCall = (qr.manager.save as jest.Mock).mock.calls.find(
        ([arg]: [any]) => arg && arg.time instanceof Date,
      );
      expect(meterCall).toBeDefined();
    });
  });

  describe('balance reconciliation', () => {
    it('updates balance from edge device when difference is within tolerance', async () => {
      const unit = makeUnit({ balance: 50_000, last_energy_reading: 100 });
      const { qr } = await buildModule(unit);

      // Edge reports Rp49_800 (diff = 200, within Rp500 tolerance)
      await service.saveSensorData({
        _deviceId: 'DEV-A-101',
        et: 100, wt: 10, p: 0, v: 220, c: 0, wf: 0, b: 49_800,
      });

      const savedCall = (qr.manager.save as jest.Mock).mock.calls.find(
        ([arg]: [any]) => arg && typeof arg.balance !== 'undefined' && !arg.time,
      );
      expect(Number(savedCall?.[0]?.balance)).toBe(49_800);
    });

    it('ignores edge balance when mismatch exceeds threshold (tamper guard)', async () => {
      const unit = makeUnit({ balance: 50_000, last_energy_reading: 100 });
      const { qr } = await buildModule(unit);

      // Edge reports Rp100 (diff = 49 900, suspicious)
      await service.saveSensorData({
        _deviceId: 'DEV-A-101',
        et: 100, wt: 10, p: 0, v: 220, c: 0, wf: 0, b: 100,
      });

      const savedCall = (qr.manager.save as jest.Mock).mock.calls.find(
        ([arg]: [any]) => arg && typeof arg.balance !== 'undefined' && !arg.time,
      );
      // Balance should NOT be set to 100
      expect(Number(savedCall?.[0]?.balance ?? 50_000)).not.toBe(100);
    });
  });

  describe('input validation', () => {
    it('returns early when deviceId is absent', async () => {
      const unit = makeUnit();
      await buildModule(unit);
      await expect(service.saveSensorData({})).resolves.toBeUndefined();
      expect(mockDataSource.createQueryRunner().startTransaction).not.toHaveBeenCalled();
    });

    it('returns early when binary payload is < 21 bytes', async () => {
      const unit = makeUnit();
      await buildModule(unit);
      const shortBuf = Buffer.alloc(10);
      await expect(service.saveSensorData(shortBuf)).resolves.toBeUndefined();
    });
  });

  describe('anomaly service integration', () => {
    it('calls AnomalyService.checkOnTelemetry after successful save', async () => {
      const unit = makeUnit({ balance: 50_000, last_energy_reading: 100 });
      await buildModule(unit);

      await service.saveSensorData({
        _deviceId: 'DEV-A-101',
        et: 100.1, wt: 10, p: 200, v: 220, c: 0.9, wf: 0, b: null,
      });

      expect(mockAnomalyService.checkOnTelemetry).toHaveBeenCalled();
    });
  });
});
