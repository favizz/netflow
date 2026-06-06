/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TopupDeliveryService } from './topup-delivery.service';
import { TopupDelivery } from './entities/topup-delivery.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDelivery(overrides: Partial<TopupDelivery> = {}): TopupDelivery {
  return {
    id: 1,
    transaction_id: 'TRX-001',
    unit_no: 'A-101',
    device_id: 'DEV-A-101',
    electricity_amount_rp: 15000,
    water_amount_rp: 10000,
    status: 'pending',
    attempt_count: 0,
    command_timestamp: 1749168000,
    payload_json: null,
    ack_json: null,
    last_error: null,
    sent_at: null,
    acked_at: null,
    confirmed_at: null,
    created_at: new Date('2026-06-06T10:00:00Z'),
    updated_at: new Date('2026-06-06T10:00:00Z'),
    ...overrides,
  } as TopupDelivery;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let service: TopupDeliveryService;
let repo: {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

async function buildModule() {
  repo = {
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TopupDeliveryService,
      { provide: getRepositoryToken(TopupDelivery), useValue: repo },
    ],
  }).compile();

  service = module.get(TopupDeliveryService);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TopupDeliveryService', () => {
  beforeEach(async () => {
    await buildModule();
  });

  // ── createPending ────────────────────────────────────────────────────────────

  describe('createPending', () => {
    const input = {
      transactionId: 'TRX-001',
      unitNo: 'A-101',
      deviceId: 'DEV-A-101',
      electricityAmountRp: 15000,
      waterAmountRp: 10000,
      commandTimestamp: 1749168000,
      payload: { electricAmountRp: 15000, waterAmountRp: 10000, timestamp: 1749168000 },
    };

    it('creates a new pending delivery when no existing record', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = makeDelivery({ status: 'pending', attempt_count: 0 });
      repo.save.mockResolvedValue(created);

      const result = await service.createPending(input);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { transaction_id: 'TRX-001' } });
      expect(repo.save).toHaveBeenCalled();
      expect(result.status).toBe('pending');
      expect(result.attempt_count).toBe(0);
    });

    it('returns existing delivery without creating a duplicate (idempotent)', async () => {
      const existing = makeDelivery({ status: 'sent' });
      repo.findOne.mockResolvedValue(existing);

      const result = await service.createPending(input);

      expect(repo.save).not.toHaveBeenCalled();
      expect(result.status).toBe('sent');
    });
  });

  // ── markSent ─────────────────────────────────────────────────────────────────

  describe('markSent', () => {
    it('updates status to sent, increments attempt_count, and sets sent_at', async () => {
      const delivery = makeDelivery({ status: 'pending', attempt_count: 0, sent_at: null });
      repo.findOne.mockResolvedValue(delivery);

      const payload = { electricAmountRp: 15000, waterAmountRp: 10000, timestamp: 1749168000 };
      await service.markSent('TRX-001', payload);

      expect(repo.save).toHaveBeenCalled();
      const saved = repo.save.mock.calls[0][0];
      expect(saved.status).toBe('sent');
      expect(saved.attempt_count).toBe(1);
      expect(saved.sent_at).toBeInstanceOf(Date);
      expect(saved.last_error).toBeNull();
      expect(saved.payload_json).toEqual(payload);
    });

    it('does nothing if delivery not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.markSent('TRX-NONEXISTENT', {});
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  // ── markFailed ───────────────────────────────────────────────────────────────

  describe('markFailed', () => {
    it('sets status to failed, increments attempt_count, and stores error message', async () => {
      const delivery = makeDelivery({ status: 'pending', attempt_count: 0 });
      repo.findOne.mockResolvedValue(delivery);

      await service.markFailed('TRX-001', 'MQTT connection refused');

      const saved = repo.save.mock.calls[0][0];
      expect(saved.status).toBe('failed');
      expect(saved.attempt_count).toBe(1);
      expect(saved.last_error).toBe('MQTT connection refused');
    });

    it('truncates error message to 255 characters', async () => {
      const delivery = makeDelivery();
      repo.findOne.mockResolvedValue(delivery);

      const longError = 'E'.repeat(300);
      await service.markFailed('TRX-001', longError);

      const saved = repo.save.mock.calls[0][0];
      expect(saved.last_error!.length).toBe(255);
    });

    it('does nothing if delivery not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.markFailed('TRX-NONEXISTENT', 'error');
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  // ── markLatestAckForDevice ───────────────────────────────────────────────────

  describe('markLatestAckForDevice', () => {
    it('marks delivery as acked and sets acked_at when ack status is ok', async () => {
      const delivery = makeDelivery({ status: 'sent', sent_at: new Date() });
      repo.findOne.mockResolvedValue(delivery);

      const ack = { status: 'ok', amount: 25000 };
      const result = await service.markLatestAckForDevice('DEV-A-101', ack);

      expect(result).not.toBeNull();
      const saved = repo.save.mock.calls[0][0];
      expect(saved.status).toBe('acked');
      expect(saved.acked_at).toBeInstanceOf(Date);
      expect(saved.ack_json).toEqual(ack);
      expect(saved.last_error).toBeNull();
    });

    it('marks delivery as failed when ack status is not ok', async () => {
      const delivery = makeDelivery({ status: 'sent', sent_at: new Date() });
      repo.findOne.mockResolvedValue(delivery);

      const ack = { status: 'error', error: 'checksum mismatch' };
      const result = await service.markLatestAckForDevice('DEV-A-101', ack);

      expect(result).not.toBeNull();
      const saved = repo.save.mock.calls[0][0];
      expect(saved.status).toBe('failed');
      expect(saved.acked_at).toBeNull();
      expect(saved.last_error).toBe('checksum mismatch');
    });

    it('uses fallback error message when ack has no error field', async () => {
      const delivery = makeDelivery({ status: 'sent', sent_at: new Date() });
      repo.findOne.mockResolvedValue(delivery);

      const ack = { status: 'nok' };
      await service.markLatestAckForDevice('DEV-A-101', ack);

      const saved = repo.save.mock.calls[0][0];
      expect(saved.last_error).toBe('device rejected top-up');
    });

    it('returns null and warns if no pending or sent delivery for device', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.markLatestAckForDevice('DEV-UNKNOWN', { status: 'ok' });

      expect(result).toBeNull();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('also handles pending-status delivery (not yet sent)', async () => {
      const delivery = makeDelivery({ status: 'pending', sent_at: null });
      repo.findOne.mockResolvedValue(delivery);

      const ack = { status: 'ok' };
      const result = await service.markLatestAckForDevice('DEV-A-101', ack);

      expect(result).not.toBeNull();
      expect(repo.save.mock.calls[0][0].status).toBe('acked');
    });
  });

  // ── toResponse ───────────────────────────────────────────────────────────────

  describe('toResponse', () => {
    it('returns null when delivery is null', () => {
      expect(service.toResponse(null)).toBeNull();
    });

    it('returns formatted response object with ISO date strings', () => {
      const now = new Date('2026-06-06T12:00:00Z');
      const delivery = makeDelivery({
        status: 'acked',
        attempt_count: 1,
        device_id: 'DEV-A-101',
        sent_at: now,
        acked_at: now,
        confirmed_at: null,
        last_error: null,
      });

      const response = service.toResponse(delivery);

      expect(response).toEqual({
        status: 'acked',
        attemptCount: 1,
        deviceId: 'DEV-A-101',
        sentAt: now.toISOString(),
        ackedAt: now.toISOString(),
        confirmedAt: null,
        lastError: null,
      });
    });

    it('returns null for date fields when dates are null', () => {
      const delivery = makeDelivery({ sent_at: null, acked_at: null, confirmed_at: null });
      const response = service.toResponse(delivery);

      expect(response!.sentAt).toBeNull();
      expect(response!.ackedAt).toBeNull();
      expect(response!.confirmedAt).toBeNull();
    });
  });

  // ── findByTransactionId ──────────────────────────────────────────────────────

  describe('findByTransactionId', () => {
    it('returns delivery when found', async () => {
      const delivery = makeDelivery();
      repo.findOne.mockResolvedValue(delivery);

      const result = await service.findByTransactionId('TRX-001');

      expect(result).toBe(delivery);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { transaction_id: 'TRX-001' } });
    });

    it('returns null when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.findByTransactionId('TRX-NONEXISTENT');
      expect(result).toBeNull();
    });
  });
});
