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
    balance: 100_000,
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
    createQueryBuilder: jest.Mock;
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
      createQueryBuilder: jest.fn(),
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
    it('creates unit with default balance of 0 when not provided', async () => {
      unitRepo.findOne.mockResolvedValue(null);
      await service.create({ unit_no: 'A-101', device_id: 'DEV-A-101' });
      const created = unitRepo.create.mock.calls[0][0];
      expect(created.balance).toBe(0);
      expect(created.relay_status).toBe(true);
    });

    it('uses provided balance when given', async () => {
      unitRepo.findOne.mockResolvedValue(null);
      await service.create({ unit_no: 'A-102', device_id: 'DEV-A-102', balance: 50_000 });
      const created = unitRepo.create.mock.calls[0][0];
      expect(created.balance).toBe(50_000);
    });

    it('throws BadRequestException when unit_no already exists', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit());
      await expect(service.create({ unit_no: 'A-101', device_id: 'DEV-A-101' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns unit when it exists', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit());
      const result = await service.findOne(1);
      expect(result.unit_no).toBe('A-101');
    });

    it('throws NotFoundException when unit does not exist', async () => {
      unitRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findByUnitNo ──────────────────────────────────────────────────────────────

  describe('findByUnitNo', () => {
    it('returns unit when found by unit_no', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit());
      const result = await service.findByUnitNo('A-101');
      expect(result.id).toBe(1);
    });

    it('throws NotFoundException for unknown unit_no', async () => {
      unitRepo.findOne.mockResolvedValue(null);
      await expect(service.findByUnitNo('NONEXISTENT')).rejects.toThrow(NotFoundException);
    });
  });

  // ── creditBalanceByUnitNo ────────────────────────────────────────────────────

  describe('creditBalanceByUnitNo', () => {
    it('adds credit to existing balance', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ balance: 50_000 }));
      await service.creditBalanceByUnitNo('A-101', 25_000);
      const saved = unitRepo.save.mock.calls[0][0];
      expect(Number(saved.balance)).toBe(75_000);
    });

    it('throws NotFoundException for unknown unit', async () => {
      unitRepo.findOne.mockResolvedValue(null);
      await expect(service.creditBalanceByUnitNo('NONEXISTENT', 10_000)).rejects.toThrow(NotFoundException);
    });
  });

  // ── setRelayStatus ────────────────────────────────────────────────────────────

  describe('setRelayStatus', () => {
    it('updates relay_status on the unit', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ relay_status: true }));
      await service.setRelayStatus(1, false);
      const saved = unitRepo.save.mock.calls[0][0];
      expect(saved.relay_status).toBe(false);
    });

    it('logs actuation when actorEmail provided', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit());
      await service.setRelayStatus(1, false, 'admin@test.com');
      expect(auditLogService.log).toHaveBeenCalledWith(
        'admin@test.com',
        'REMOTE_ACTUATION',
        'unit',
        '1',
        expect.objectContaining({ type: 'relay', value: false }),
      );
    });

    it('does not log when actorEmail is not provided', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit());
      await service.setRelayStatus(1, false);
      expect(auditLogService.log).not.toHaveBeenCalled();
    });
  });

  // ── setValveStatus ────────────────────────────────────────────────────────────

  describe('setValveStatus', () => {
    it('updates valve_status on the unit', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ valve_status: true }));
      await service.setValveStatus(1, false);
      const saved = unitRepo.save.mock.calls[0][0];
      expect(saved.valve_status).toBe(false);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes unit and returns deleted id', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit());
      const result = await service.remove(1);
      expect(result).toEqual({ deleted: true, id: 1 });
      expect(unitRepo.remove).toHaveBeenCalled();
    });

    it('throws NotFoundException when unit does not exist', async () => {
      unitRepo.findOne.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ── getOwnerDashboard ─────────────────────────────────────────────────────────

  describe('getOwnerDashboard', () => {
    it('calculates remaining kWh estimate from balance and tariff', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ balance: 144_470 }));
      tariffService.findCurrent.mockResolvedValue(1444.7);

      const result = await service.getOwnerDashboard('A-101');
      expect(result.remainingEstimate.kwh).toBeCloseTo(100, 0);
    });

    it('marks unit offline when no telemetry exists', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit());
      meterRepo.findOne.mockResolvedValue(null);

      const result = await service.getOwnerDashboard('A-101');
      expect(result.connectivity.online).toBe(false);
    });

    it('marks unit online when telemetry is recent', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit());
      meterRepo.findOne.mockResolvedValue({ time: new Date() });

      const result = await service.getOwnerDashboard('A-101');
      expect(result.connectivity.online).toBe(true);
    });
  });

  // ── getUnitNotifications ──────────────────────────────────────────────────────

  describe('getUnitNotifications', () => {
    it('returns warning when balance is at or below threshold', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ balance: 15_000 }));
      meterRepo.findOne.mockResolvedValue(null);

      const notes = await service.getUnitNotifications('A-101');
      expect(notes.some((n) => n.type === 'warning')).toBe(true);
    });

    it('returns error when relay is off', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ relay_status: false, balance: 100_000 }));
      meterRepo.findOne.mockResolvedValue(new Date());

      const notes = await service.getUnitNotifications('A-101');
      expect(notes.some((n) => n.type === 'error')).toBe(true);
    });

    it('returns info-only when unit is healthy', async () => {
      unitRepo.findOne.mockResolvedValue(makeUnit({ balance: 100_000, relay_status: true }));
      meterRepo.findOne.mockResolvedValue({ time: new Date() });

      const notes = await service.getUnitNotifications('A-101');
      expect(notes).toHaveLength(1);
      expect(notes[0].type).toBe('info');
    });
  });
});
