/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DeviceService } from './device.service';
import { MeterReading } from './entities/device.entity';
import { Unit } from '../admin/unit/entities/unit.entity';
import { AnomalyService } from '../anomaly/anomaly.service';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 1,
    unit_no: 'A-101',
    device_id: 'DEV-A-101',
    building_id: 1,
    resident_email: 'test@example.com',
    token_electricity: 100,
    token_water: 50,
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
let mockDataSource: { createQueryRunner: jest.Mock };

async function buildModule(unit: Unit): Promise<{ qr: any }> {
  const { queryRunner, savedUnit } = makeQueryRunner(unit);
  mockDataSource = { createQueryRunner: jest.fn().mockReturnValue(queryRunner) };
  mockMqttClient = { emit: jest.fn() };
  mockAnomalyService = { checkOnTelemetry: jest.fn().mockResolvedValue(undefined) };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DeviceService,
      { provide: getRepositoryToken(MeterReading), useValue: {} },
      { provide: DataSource, useValue: mockDataSource },
      { provide: 'MQTT_CLIENT', useValue: mockMqttClient },
      { provide: AnomalyService, useValue: mockAnomalyService },
    ],
  }).compile();

  service = module.get(DeviceService);
  return { qr: queryRunner };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeviceService.saveSensorData', () => {
  describe('token deduction', () => {
    it('deducts electricity tokens when energy delta > 0', async () => {
      const unit = makeUnit({ token_electricity: 100, last_energy_reading: 100 });
      const { qr } = await buildModule(unit);

      // Delta = 0.5 kWh
      await service.saveSensorData({
        _deviceId: 'DEV-A-101',
        et: 100.5, wt: 10, p: 500, v: 220, c: 2.27, wf: 0,
      });

      const savedCall = qr.manager.save.mock.calls.find(
        ([arg]: [any]) => arg && typeof arg.token_electricity !== 'undefined',
      );
      expect(savedCall).toBeDefined();
      expect(Number(savedCall[0].token_electricity)).toBeCloseTo(99.5, 1);
    });

    it('deducts water tokens when water delta > 0', async () => {
      const unit = makeUnit({ token_water: 50, last_water_reading: 10 });
      const { qr } = await buildModule(unit);

      // Delta = 0.1 m³
      await service.saveSensorData({
        _deviceId: 'DEV-A-101',
        et: 100, wt: 10.1, p: 0, v: 220, c: 0, wf: 1.5,
      });

      const savedCall = qr.manager.save.mock.calls.find(
        ([arg]: [any]) => arg && typeof arg.token_water !== 'undefined',
      );
      expect(savedCall).toBeDefined();
      expect(Number(savedCall[0].token_water)).toBeCloseTo(49.9, 1);
    });
  });

  describe('relay cutoff on zero tokens', () => {
    it('emits relay OFF MQTT command when electricity tokens hit zero', async () => {
      const unit = makeUnit({ token_electricity: 0.05, last_energy_reading: 100, relay_status: true });
      await buildModule(unit);

      // Delta = 0.1 kWh -> token goes to 0
      await service.saveSensorData({
        _deviceId: 'DEV-A-101',
        et: 100.1, wt: 10, p: 1000, v: 220, c: 4.5, wf: 0,
      });

      expect(mockMqttClient.emit).toHaveBeenCalledWith(
        'device/DEV-A-101/command',
        expect.any(Buffer),
      );
    });
  });


});
