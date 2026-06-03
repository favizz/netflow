/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { PaymentsService } from './payments.service';
import { Transaction } from './entities/transaction.entity';
import { UnitService } from '../admin/unit/unit.service';
import { TariffService } from '../admin/tariff/tariff.service';
import { AuditLogService } from '../admin/audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { PAYMENT_EXPIRY_QUEUE } from './payment-expiry.processor';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Unit } from '../admin/unit/entities/unit.entity';

// ── Helpers ─────────────────────────────────────────────────────────────────

const SERVER_KEY = 'test-server-key-abc123';

function buildSignature(order_id: string, status_code: string, gross_amount: string): string {
  return crypto
    .createHash('sha512')
    .update(order_id + status_code + gross_amount + SERVER_KEY)
    .digest('hex');
}

function makeWebhookPayload(overrides: Record<string, any> = {}) {
  const order_id     = overrides.order_id     ?? 'TRX-001';
  const status_code  = overrides.status_code  ?? '200';
  const gross_amount = overrides.gross_amount ?? '50000.00';
  const txStatus    = overrides.transaction_status ?? 'settlement';

  return {
    order_id,
    status_code,
    gross_amount,
    transaction_id:      overrides.transaction_id ?? 'mdt-abc123',
    transaction_status:  txStatus,
    fraud_status:        overrides.fraud_status ?? 'accept',
    signature_key:       overrides.signature_key ?? buildSignature(order_id, status_code, gross_amount),
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
  let unitService: { findByUnitNo: jest.Mock; creditTokensByUnitNo: jest.Mock };
  let tariffService: { findCurrent: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let unitRepo: { findOneBy: jest.Mock };

  beforeEach(async () => {
    txRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation(data => data),
      save: jest.fn().mockImplementation(tx => Promise.resolve(tx)),
      find: jest.fn().mockResolvedValue([]),
    };

    unitService = {
      findByUnitNo: jest.fn().mockResolvedValue({ id: 1, unit_no: 'A-101', token_electricity: 0, token_water: 0 }),
      creditTokensByUnitNo: jest.fn().mockResolvedValue({ id: 1, unit_no: 'A-101', token_electricity: 10, device_id: null }),
    };

    tariffService = {
      findCurrent: jest.fn().mockImplementation((type: string) =>
        type === 'electricity' ? 1500 : 5000,
      ),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    unitRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 1,
        unit_no: 'A-101',
        resident_email: 'resident@test.com',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Transaction), useValue: txRepo },
        { provide: getRepositoryToken(Unit), useValue: unitRepo },
        { provide: UnitService, useValue: unitService },
        { provide: TariffService, useValue: tariffService },
        { provide: getQueueToken(PAYMENT_EXPIRY_QUEUE), useValue: { add: jest.fn().mockResolvedValue(undefined) } },
        { provide: AuditLogService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, fallback?: any) => {
              if (key === 'MIDTRANS_SERVER_KEY') return SERVER_KEY;
              if (key === 'MIDTRANS_IS_PRODUCTION') return 'false';
              return fallback;
            }),
          },
        },
        { provide: 'MQTT_CLIENT', useValue: { emit: jest.fn() } },
        { provide: NotificationService, useValue: { sendHtmlNotification: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  // ── handleWebhook ────────────────────────────────────────────────────────────

  describe('handleWebhook', () => {
    it('credits tokens and marks success on settlement', async () => {
      const tx: Partial<Transaction> = {
        id: 'TRX-001',
        unit_no: 'A-101',
        electricity_amount_rp: 15_000,
        water_amount_rp: 15_000,
        status: 'pending',
        webhook_event_id: null as any,
        confirmed_at: null as any,
      };
      txRepo.findOne
        .mockResolvedValueOnce(null)  // idempotency check (no existing)
        .mockResolvedValueOnce(tx);   // find by order_id

      const payload = makeWebhookPayload({ order_id: 'TRX-001', gross_amount: '30000.00', transaction_status: 'settlement' });
      const result = await service.handleWebhook(payload);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.completed',
        expect.objectContaining({
          transactionId: 'TRX-001',
          unitNo: 'A-101',
          electricityAmountRp: 15_000,
          waterAmountRp: 15_000,
        }),
      );
      expect(result.status).toBe('success');
    });

    it('does not double-credit on duplicate webhook (idempotency)', async () => {
      const existingTx: Partial<Transaction> = {
        id: 'TRX-001',
        unit_no: 'A-101',
        electricity_amount_rp: 25_000,
        water_amount_rp: 25_000,
        status: 'success',
        webhook_event_id: 'mdt-abc123-settlement',
        confirmed_at: new Date() as any,
        created_at: new Date(),
      };
      txRepo.findOne.mockResolvedValueOnce(existingTx);

      const payload = makeWebhookPayload({ transaction_status: 'settlement' });
      const result = await service.handleWebhook(payload);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect((result as any).idempotent).toBe(true);
    });

    it('marks transaction as failed on expire/cancel', async () => {
      const tx: Partial<Transaction> = {
        id: 'TRX-002',
        unit_no: 'A-102',
        electricity_amount_rp: 15_000,
        water_amount_rp: 10_000,
        status: 'pending',
        webhook_event_id: null as any,
        confirmed_at: null as any,
      };
      txRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(tx);

      const payload = makeWebhookPayload({ order_id: 'TRX-002', transaction_status: 'expire' });
      const result = await service.handleWebhook(payload);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
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
    it('confirms a pending transaction and credits tokens', async () => {
      const tx: Partial<Transaction> = {
        id: 'TRX-DEV-001',
        unit_no: 'A-101',
        electricity_amount_rp: 15_000,
        water_amount_rp: 0,
        status: 'pending',
        confirmed_at: null as any,
        created_at: new Date(),
      };
      txRepo.findOne.mockResolvedValue(tx);

      const result = await service.autoConfirm('TRX-DEV-001');
      expect(result.status).toBe('success');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.completed',
        expect.objectContaining({
          transactionId: 'TRX-DEV-001',
          unitNo: 'A-101',
          electricityAmountRp: 15_000,
          waterAmountRp: 0,
        }),
      );
    });

    it('is idempotent - does not re-credit already-confirmed transaction', async () => {
      const tx: Partial<Transaction> = {
        id: 'TRX-DONE',
        unit_no: 'A-101',
        electricity_amount_rp: 25_000,
        water_amount_rp: 25_000,
        status: 'success',
        confirmed_at: new Date() as any,
        created_at: new Date(),
      };
      txRepo.findOne.mockResolvedValue(tx);

      await service.autoConfirm('TRX-DONE');
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
