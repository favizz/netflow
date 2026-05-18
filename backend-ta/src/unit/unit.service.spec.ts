/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UnitService } from './unit.service';
import { Unit } from './entities/unit.entity';
import { MeterReading } from '../device/entities/device.entity';
import { TariffService } from '../tariff/tariff.service';
import { AuditLogService } from '../audit-log/audit-log.service';

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 1,
    unit_no: 'A-101',
    device_id: 'DEV-A-101',
    building_id: 1,
    resident_email: null,
    token_electricity: 100,
    token_water: 50,
    relay_status: true,
    valve_status: true,
    last_energy_reading: 0,
    last_water_reading: 0,
    created_at: new Date(),
    ...overrides,
  } as Unit;
}

describe('UnitService', () => {
  let service: UnitService;
  let unitRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  let meterRepo: { findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let tariffService: { findCurrent: jest.Mock };
  let auditLogService: { log: jest.Mock };

  beforeEach(async () => {
    unitRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    };

    meterRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    };

    tariffService = {
      findCurrent: jest.fn().mockImplementation((type: string) =>
        type === 'electricity' ? 1444.7 : 5000,
      ),
    };

    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitService,
        { provide: getRepositoryToken(Unit), useValue: unitRepo },
        { provide: getRepositoryToken(MeterReading), useValue: meterRepo },
        { provide: TariffService, useValue: tariffService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(UnitService);
  });

  // ── create ────────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates unit with default tokens of 0', async () => {
      unitRepo.findOne.mockResolvedValue(null);
      await service.create({ unit_no: 'A-101', device_id: 'DEV-A-101' });
      const created = unitRepo.create.mock.calls[0][0];
      expect(created.token_electricity).toBe(0);
      expect(created.token_water).toBe(0);
      expect(created.relay_status).toBe(true);
    });

    it('throws BadRequestException when unit_no already exists', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit());
      await expect(service.create({ unit_no: 'A-101', device_id: 'DEV-A-101' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ── creditTokensByUnitNo ────────────────────────────────────────────────────

  describe('creditTokensByUnitNo', () => {
    it('adds tokens to existing token_electricity', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ token_electricity: 50 }));
      await service.creditTokensByUnitNo('A-101', 25, 'electricity');
      const saved = unitRepo.save.mock.calls[0][0];
      expect(Number(saved.token_electricity)).toBe(75);
    });

    it('adds tokens to existing token_water', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ token_water: 10 }));
      await service.creditTokensByUnitNo('A-101', 5, 'water');
      const saved = unitRepo.save.mock.calls[0][0];
      expect(Number(saved.token_water)).toBe(15);
    });
  });

  // ── getOwnerDashboard ─────────────────────────────────────────────────────────

  describe('getOwnerDashboard', () => {
    it('returns tokens and connectivity status', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ token_electricity: 100, token_water: 50 }));
      tariffService.findCurrent.mockResolvedValue(1444.7);

      const result = await service.getOwnerDashboard('A-101');
      expect(result.tokenElectricity).toBe(100);
      expect(result.tokenWater).toBe(50);
      expect(result.remainingEstimate.kwh).toBe(100);
    });
  });

  // ── getUnitNotifications ──────────────────────────────────────────────────────

  describe('getUnitNotifications', () => {
    it('returns warning when token_electricity is at or below threshold', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ token_electricity: 5 }));
      meterRepo.findOne.mockResolvedValue(null);

      const notes = await service.getUnitNotifications('A-101');
      expect(notes.some((n) => n.type === 'warning')).toBe(true);
    });

    it('returns error when relay is off', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ relay_status: false, token_electricity: 100 }));
      meterRepo.findOne.mockResolvedValue(new Date());

      const notes = await service.getUnitNotifications('A-101');
      expect(notes.some((n) => n.type === 'error')).toBe(true);
    });
  });
});
