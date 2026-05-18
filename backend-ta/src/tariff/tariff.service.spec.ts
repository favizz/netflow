/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { TariffService } from './tariff.service';
import { Tariff } from './entities/tariff.entity';

function makeTariff(overrides: Partial<Tariff> = {}): Tariff {
  return {
    id: 1,
    utility_type: 'electricity',
    price_per_unit: 1444.7 as any,
    effective_date: '2025-01-01',
    ...overrides,
  } as Tariff;
}

describe('TariffService', () => {
  let service: TariffService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TariffService,
        { provide: getRepositoryToken(Tariff), useValue: repo },
      ],
    }).compile();

    service = module.get(TariffService);
  });

  // ── findAll ───────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all tariffs ordered by type and date', async () => {
      const tariffs = [makeTariff(), makeTariff({ utility_type: 'water', id: 2 })];
      repo.find.mockResolvedValue(tariffs);

      const result = await service.findAll();
      expect(result).toHaveLength(2);
      expect(repo.find).toHaveBeenCalledWith({
        order: { utility_type: 'ASC', effective_date: 'DESC' },
      });
    });
  });

  // ── findCurrent ───────────────────────────────────────────────────────────────

  describe('findCurrent', () => {
    it('returns tariff price when a current tariff exists', async () => {
      repo.findOne.mockResolvedValue(makeTariff({ price_per_unit: 1600 as any }));
      const price = await service.findCurrent('electricity');
      expect(price).toBe(1600);
    });

    it('returns default electricity price (1444.7) when no tariff exists', async () => {
      repo.findOne.mockResolvedValue(null);
      const price = await service.findCurrent('electricity');
      expect(price).toBe(1444.7);
    });

    it('returns default water price (5000) when no tariff exists', async () => {
      repo.findOne.mockResolvedValue(null);
      const price = await service.findCurrent('water');
      expect(price).toBe(5000);
    });
  });

  // ── create ────────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates and saves a new tariff when under the limit', async () => {
      repo.find.mockResolvedValue([]);
      const dto = { utility_type: 'electricity' as const, price_per_unit: 1500, effective_date: '2026-01-01' };
      const result = await service.create(dto);
      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(repo.save).toHaveBeenCalled();
      expect(result.price_per_unit).toBe(1500);
    });

    it('removes oldest tariff when at max (3) per type', async () => {
      const existing = [
        makeTariff({ id: 1, effective_date: '2025-01-01' }),
        makeTariff({ id: 2, effective_date: '2025-06-01' }),
        makeTariff({ id: 3, effective_date: '2026-01-01' }),
      ];
      repo.find.mockResolvedValue(existing);
      const dto = { utility_type: 'electricity' as const, price_per_unit: 1600, effective_date: '2026-06-01' };
      await service.create(dto);
      expect(repo.remove).toHaveBeenCalledWith([existing[0]]);
      expect(repo.save).toHaveBeenCalled();
    });
  });

  // ── update ────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates price and date of an existing tariff', async () => {
      const existing = makeTariff({ price_per_unit: 1444.7 as any });
      repo.findOne.mockResolvedValue(existing);

      const result = await service.update(1, { price_per_unit: 1600, effective_date: '2026-06-01' });
      expect(result.price_per_unit).toBe(1600);
      expect(result.effective_date).toBe('2026-06-01');
      expect(repo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when tariff does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update(99, { price_per_unit: 1500 })).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes an existing tariff and returns deleted: true', async () => {
      repo.findOne.mockResolvedValue(makeTariff());
      const result = await service.remove(1);
      expect(result).toEqual({ deleted: true });
      expect(repo.remove).toHaveBeenCalled();
    });

    it('throws NotFoundException when tariff does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });
});
