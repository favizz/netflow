import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentsService } from './payments.service';
import { Transaction } from './entities/transaction.entity';
import { UnitService } from '../unit/unit.service';

// ── Helpers ─────────────────────────────────────────────────────────────────

const SERVER_KEY = 'test-server-key-abc123';

function buildSignature(orderId: string, statusCode: string, grossAmount: string): string {
  return crypto
    .createHash('sha512')
    .update(orderId + statusCode + grossAmount + SERVER_KEY)
    .digest('hex');
}

function makeWebhookPayload(overrides: Record<string, string> = {}) {
  const orderId     = overrides.order_id     ?? 'TRX-001';
  const statusCode  = overrides.status_code  ?? '200';
  const grossAmount = overrides.gross_amount ?? '50000.00';
  const txStatus    = overrides.transaction_status ?? 'settlement';

  return {
    order_id:            orderId,
    status_code:         statusCode,
    gross_amount:        grossAmount,
    transaction_id:      overrides.transaction_id ?? 'mdt-abc123',
    transaction_status:  txStatus,
    fraud_status:        overrides.fraud_status ?? 'accept',
    signature_key:       overrides.signature_key ?? buildSignature(orderId, statusCode, grossAmount),
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('PaymentsService', () => {
  let service: PaymentsService;
  let txRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let unitService: { findByUnitNo: jest.Mock; creditBalanceByUnitNo: jest.Mock };

  beforeEach(async () => {
    txRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation(data => data),
      save: jest.fn().mockImplementation(tx => Promise.resolve(tx)),
      find: jest.fn().mockResolvedValue([]),
    };

    unitService = {
      findByUnitNo: jest.fn().mockResolvedValue({ id: 1, unit_no: 'A-101', balance: 0 }),
      creditBalanceByUnitNo: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Transaction), useValue: txRepo },
        { provide: UnitService, useValue: unitService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, fallback?: any) => {
              if (key === 'MIDTRANS_SERVER_KEY') return SERVER_KEY;
              if (key === 'MIDTRANS_IS_PRODUCTION') return 'false';
              if (key === 'PAYMENT_WEBHOOK_MAX_SKEW_MS') return 300_000;
              if (key === 'PAYMENT_WEBHOOK_ALLOWED_IPS') return '';
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  // ── handleWebhook ────────────────────────────────────────────────────────────

  describe('handleWebhook', () => {
    it('credits balance and marks success on settlement', async () => {
      const tx: Partial<Transaction> = {
        id: 'TRX-001',
        unit_no: 'A-101',
        amount_rp: 50_000 as any,
        status: 'pending',
        webhook_event_id: null as any,
        confirmed_at: null as any,
      };
      txRepo.findOne
        .mockResolvedValueOnce(null)  // idempotency check (no existing)
        .mockResolvedValueOnce(tx);   // find by order_id

      const payload = makeWebhookPayload({ transaction_status: 'settlement' });
      const result = await service.handleWebhook(payload);

      expect(unitService.creditBalanceByUnitNo).toHaveBeenCalledWith('A-101', 50_000);
      expect(result.status).toBe('success');
    });

    it('does not double-credit on duplicate webhook (idempotency)', async () => {
      const existingTx: Partial<Transaction> = {
        id: 'TRX-001',
        unit_no: 'A-101',
        amount_rp: 50_000 as any,
        status: 'success',
        webhook_event_id: 'mdt-abc123-settlement',
        confirmed_at: new Date() as any,
        created_at: new Date(),
      };
      // First call: idempotency check finds existing
      txRepo.findOne.mockResolvedValueOnce(existingTx);

      const payload = makeWebhookPayload({ transaction_status: 'settlement' });
      const result = await service.handleWebhook(payload);

      expect(unitService.creditBalanceByUnitNo).not.toHaveBeenCalled();
      expect((result as any).idempotent).toBe(true);
    });

    it('marks transaction as failed on expire/cancel', async () => {
      const tx: Partial<Transaction> = {
        id: 'TRX-002',
        unit_no: 'A-102',
        amount_rp: 25_000 as any,
        status: 'pending',
        webhook_event_id: null as any,
        confirmed_at: null as any,
      };
      txRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(tx);

      const payload = makeWebhookPayload({ order_id: 'TRX-002', transaction_status: 'expire' });
      const result = await service.handleWebhook(payload);

      expect(unitService.creditBalanceByUnitNo).not.toHaveBeenCalled();
      expect(result.status).toBe('failed');
    });

    it('throws UnauthorizedException on invalid signature', async () => {
      const payload = makeWebhookPayload({ signature_key: 'invalid-signature-xxxx' });
      await expect(service.handleWebhook(payload)).rejects.toThrow(UnauthorizedException);
    });

    it('throws NotFoundException when transaction does not exist', async () => {
      txRepo.findOne
        .mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce(null);// find by order_id

      const payload = makeWebhookPayload({ order_id: 'NONEXISTENT' });
      await expect(service.handleWebhook(payload)).rejects.toThrow(NotFoundException);
    });
  });

  // ── autoConfirm ──────────────────────────────────────────────────────────────

  describe('autoConfirm', () => {
    it('confirms a pending transaction and credits balance', async () => {
      const tx: Partial<Transaction> = {
        id: 'TRX-DEV-001',
        unit_no: 'A-101',
        amount_rp: 100_000 as any,
        status: 'pending',
        confirmed_at: null as any,
        created_at: new Date(),
      };
      txRepo.findOne.mockResolvedValue(tx);

      const result = await service.autoConfirm('TRX-DEV-001');
      expect(result.status).toBe('success');
      expect(unitService.creditBalanceByUnitNo).toHaveBeenCalledWith('A-101', 100_000);
    });

    it('is idempotent — does not re-credit already-confirmed transaction', async () => {
      const tx: Partial<Transaction> = {
        id: 'TRX-DONE',
        unit_no: 'A-101',
        amount_rp: 50_000 as any,
        status: 'success',
        confirmed_at: new Date() as any,
        created_at: new Date(),
      };
      txRepo.findOne.mockResolvedValue(tx);

      await service.autoConfirm('TRX-DONE');
      expect(unitService.creditBalanceByUnitNo).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown transaction', async () => {
      txRepo.findOne.mockResolvedValue(null);
      await expect(service.autoConfirm('NO-SUCH-TRX')).rejects.toThrow(NotFoundException);
    });
  });

  // ── listTransactionsForUnit ───────────────────────────────────────────────────

  describe('listTransactionsForUnit', () => {
    it('returns empty array when no transactions exist', async () => {
      txRepo.find.mockResolvedValue([]);
      const result = await service.listTransactionsForUnit('A-101');
      expect(result).toEqual([]);
    });

    it('maps transaction fields correctly', async () => {
      const tx: Partial<Transaction> = {
        id: 'TRX-MAP-001',
        unit_no: 'A-101',
        amount_rp: 75_000 as any,
        method: 'qris',
        status: 'success',
        gateway_reference: 'GW-REF',
        created_at: new Date('2026-01-01T10:00:00Z'),
        confirmed_at: new Date('2026-01-01T10:05:00Z'),
      };
      txRepo.find.mockResolvedValue([tx]);

      const [result] = await service.listTransactionsForUnit('A-101');
      expect(result.id).toBe('TRX-MAP-001');
      expect(result.amount).toBe(75_000);
      expect(result.method).toBe('qris');
      expect(result.status).toBe('success');
    });
  });
});
