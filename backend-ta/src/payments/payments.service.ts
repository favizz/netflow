/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditLogService } from '../admin/audit-log/audit-log.service';
import { Transaction } from './entities/transaction.entity';
import { InitiateTopupDto } from './dto/initiate-topup.dto';
import { PAYMENT_EXPIRY_QUEUE } from './payment-expiry.processor';
import { createHash } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentCompletedEvent } from './events/payment-completed.event';
import { Unit } from '../admin/unit/entities/unit.entity';
import { TopupDeliveryService } from './topup-delivery.service';

const PAYMENT_EXPIRY_MS = 30 * 60 * 1_000; // 30 minutes

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
    @InjectQueue(PAYMENT_EXPIRY_QUEUE)
    private readonly expiryQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(Unit) private readonly unitRepo: Repository<Unit>,
    @Optional()
    private readonly topupDeliveryService?: TopupDeliveryService,
  ) {}

  async initiateTopup(dto: InitiateTopupDto) {
    const unit = await this.unitRepo.findOneBy({ unit_no: dto.unitNo }); // validate unit exists
    if (!unit) throw new NotFoundException('Unit not found');

    const totalAmount = dto.electricityAmount + dto.waterAmount;
    if (totalAmount < 1000) {
      throw new Error('Total amount must be at least Rp 1.000');
    }

    const isProd =
      this.configService.get<string>('MIDTRANS_IS_PRODUCTION') === 'true';
    const serverKey = this.configService.get<string>('MIDTRANS_SERVER_KEY');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const midtransClient = require('midtrans-client');
    const coreApi = new midtransClient.CoreApi({
      isProduction: isProd,
      serverKey: serverKey,
      clientKey: this.configService.get<string>('MIDTRANS_CLIENT_KEY') || '',
    });

    // Cancel any stale pending transactions so the unit never accumulates
    // unresolved charges from a previous abandoned payment session.
    const stalePending = await this.txRepo.find({
      where: { unit_no: dto.unitNo, status: 'pending' },
    });
    for (const stale of stalePending) {
      try {
        await coreApi.transaction.cancel(stale.id);
      } catch {
        // Already expired or settled on Midtrans side — safe to ignore.
      }
      stale.status = 'failed';
      stale.webhook_event_id = `${stale.id}-superseded`;
      await this.txRepo.save(stale);
      this.logger.log(
        `Superseded stale pending transaction ${stale.id} for unit ${dto.unitNo}`,
      );
    }

    const id = `TRX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const paymentParams: any = {
      payment_type: dto.method === 'transfer' ? 'bank_transfer' : 'gopay',
      transaction_details: {
        order_id: id,
        gross_amount: totalAmount,
      },
      customer_details: {
        first_name: 'Resident',
        last_name: `Unit ${dto.unitNo}`,
        email: unit.resident_email || undefined,
      },
    };

    if (dto.method === 'transfer') {
      paymentParams.bank_transfer = { bank: 'bca' };
    }

    try {
      const mResponse = await coreApi.charge(paymentParams);

      let vaNumber = undefined;
      let qrUrl = undefined;

      if (mResponse.va_numbers && mResponse.va_numbers.length > 0) {
        vaNumber = mResponse.va_numbers[0].va_number;
      }

      if (mResponse.actions) {
        const qrAction = mResponse.actions.find(
          (a: any) => a.name === 'generate-qr-code',
        );
        if (qrAction) qrUrl = qrAction.url;
      }

      const tx = this.txRepo.create({
        id,
        unit_no: dto.unitNo,
        electricity_amount_rp: dto.electricityAmount,
        water_amount_rp: dto.waterAmount,
        method: dto.method,
        status: 'pending',
        gateway_reference: mResponse.transaction_id || mResponse.order_id,
      });

      await this.txRepo.save(tx);

      void this.auditLogService.log(
        dto.unitNo,
        'TOKEN_PURCHASE',
        'transaction',
        id,
        {
          total: totalAmount,
          method: dto.method,
          status: 'pending',
        },
        'info',
      );

      // Schedule auto-cancel after 30 minutes if payment is not settled
      try {
        await this.expiryQueue.add(
          'expire',
          { transactionId: id },
          {
            delay: PAYMENT_EXPIRY_MS,
            removeOnComplete: true,
            removeOnFail: 100,
          },
        );
      } catch {
        this.logger.warn(
          `Could not schedule expiry for ${id} (Redis unavailable)`,
        );
      }

      return {
        transactionId: id,
        gatewayReference: tx.gateway_reference,
        vaNumber,
        qrUrl,
        status: tx.status,
        expiresAt: new Date(Date.now() + PAYMENT_EXPIRY_MS).toISOString(),
      };
    } catch (e: any) {
      this.logger.error('Midtrans Error:', e);
      throw new Error('Gagal initiate pembayaran dengan Midtrans', {
        cause: e,
      });
    }
  }

  async handleWebhook(dto: any) {
    this.verifyMidtransSignature(dto);

    // Using transaction_id for event id since midtrans might ping multiple times
    const eventId = dto.transaction_id + '-' + dto.transaction_status;
    const alreadyProcessed = await this.txRepo.findOne({
      where: { webhook_event_id: eventId },
    });
    if (alreadyProcessed) {
      void this.auditLogService.log(
        'midtrans',
        'TOKEN_PURCHASE',
        'transaction',
        alreadyProcessed.id,
        { event: eventId, status: 'duplicate_webhook' },
        'info',
      );
      return { ...this.toResponse(alreadyProcessed), idempotent: true };
    }

    const tx = await this.txRepo.findOne({ where: { id: dto.order_id } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (tx.status === 'pending') {
      await this.processPaymentStatusUpdate(
        tx,
        dto.transaction_status,
        dto.fraud_status,
        eventId,
      );
    }

    return this.toResponse(tx);
  }

  private async processPaymentStatusUpdate(
    tx: Transaction,
    mStatus: string,
    fStatus: string,
    eventId: string,
  ) {
    if (tx.status !== 'pending') return tx;

    let finalStatus: 'pending' | 'success' | 'failed' = 'pending';

    if (mStatus === 'capture') {
      finalStatus = fStatus === 'challenge' ? 'pending' : 'success';
    } else if (mStatus === 'settlement') {
      finalStatus = 'success';
    } else if (
      mStatus === 'cancel' ||
      mStatus === 'deny' ||
      mStatus === 'expire'
    ) {
      finalStatus = 'failed';
    }

    if (finalStatus === 'pending') return tx;

    tx.status = finalStatus;
    tx.webhook_event_id = eventId;

    if (finalStatus === 'success') {
      tx.confirmed_at = new Date();
    }

    await this.txRepo.save(tx);

    if (finalStatus === 'success') {
      this.eventEmitter.emit(
        'payment.completed',
        new PaymentCompletedEvent(
          tx.id,
          tx.unit_no,
          Number(tx.electricity_amount_rp),
          Number(tx.water_amount_rp),
          tx.method,
          tx.confirmed_at!,
        ),
      );
    }

    if (finalStatus === 'failed') {
      const totalRp =
        Number(tx.electricity_amount_rp) + Number(tx.water_amount_rp);
      void this.auditLogService.log(
        'midtrans',
        'TOKEN_PURCHASE',
        'transaction',
        tx.id,
        {
          amount: totalRp,
          method: tx.method,
          status: 'failed',
          gateway_status: mStatus,
        },
        'failure',
      );
    }

    return tx;
  }

  async autoConfirm(transactionId: string): Promise<{ status: string }> {
    const tx = await this.txRepo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (tx.status !== 'pending') {
      return { status: tx.status };
    }

    tx.status = 'success';
    tx.confirmed_at = new Date();

    await this.txRepo.save(tx);

    this.eventEmitter.emit(
      'payment.completed',
      new PaymentCompletedEvent(
        tx.id,
        tx.unit_no,
        Number(tx.electricity_amount_rp),
        Number(tx.water_amount_rp),
        tx.method,
        tx.confirmed_at,
      ),
    );

    const totalRp =
      Number(tx.electricity_amount_rp) + Number(tx.water_amount_rp);
    void this.auditLogService.log(
      tx.unit_no,
      'TOKEN_PURCHASE',
      'transaction',
      tx.id,
      { amount: totalRp, method: tx.method, status: 'success' },
      'success',
    );

    return { status: tx.status };
  }

  async getTopupStatus(unitNo: string, transactionId: string) {
    const tx = await this.getTransactionForUnit(unitNo, transactionId);

    if (tx.status === 'pending') {
      const isProd =
        this.configService.get<string>('MIDTRANS_IS_PRODUCTION') === 'true';
      const serverKey = this.configService.get<string>('MIDTRANS_SERVER_KEY');

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const midtransClient = require('midtrans-client');
      const coreApi = new midtransClient.CoreApi({
        isProduction: isProd,
        serverKey: serverKey,
        clientKey: this.configService.get<string>('MIDTRANS_CLIENT_KEY') || '',
      });

      try {
        const mResponse = await coreApi.transaction.status(tx.id);
        if (mResponse) {
          const eventId = `${tx.id}-${mResponse.transaction_status}-poll`;
          await this.processPaymentStatusUpdate(
            tx,
            mResponse.transaction_status,
            mResponse.fraud_status,
            eventId,
          );
        }
      } catch {
        // ignore Midtrans 404 or errors here, just return current pending status
      }
    }

    const delivery = this.topupDeliveryService
      ? await this.topupDeliveryService.findByTransactionId(tx.id)
      : null;

    return {
      status: tx.status,
      confirmedAt: tx.confirmed_at?.toISOString() ?? null,
      delivery: this.topupDeliveryService
        ? this.topupDeliveryService.toResponse(delivery)
        : null,
    };
  }

  async listTransactionsForUnit(unitNo: string) {
    const txs = await this.txRepo.find({
      where: { unit_no: unitNo },
      order: { created_at: 'DESC' },
    });
    return txs.map((tx) => this.toResponse(tx));
  }

  async listAllTransactions(limit = 1000) {
    const txs = await this.txRepo.find({
      order: { created_at: 'DESC' },
      take: limit,
    });
    return txs.map((tx) => this.toResponse(tx));
  }

  async getTransaction(transactionId: string): Promise<Transaction> {
    const tx = await this.txRepo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async getTransactionForUnit(
    unitNo: string,
    transactionId: string,
  ): Promise<Transaction> {
    const tx = await this.getTransaction(transactionId);
    if (tx.unit_no !== unitNo)
      throw new ForbiddenException('Transaction does not belong to this unit');
    return tx;
  }

  async buildInvoice(transactionId: string): Promise<string> {
    const tx = await this.getTransaction(transactionId);
    return this.formatInvoice(tx);
  }

  async buildInvoiceForUnit(
    unitNo: string,
    transactionId: string,
  ): Promise<string> {
    const tx = await this.getTransactionForUnit(unitNo, transactionId);
    return this.formatInvoice(tx);
  }

  private toResponse(tx: Transaction) {
    // Robust date conversion to prevent 500 errors if DB returns strings
    const ensureIso = (d: any) => {
      if (!d) return null;
      try {
        const date = d instanceof Date ? d : new Date(d);
        return isNaN(date.getTime()) ? null : date.toISOString();
      } catch {
        return null;
      }
    };

    return {
      id: tx.id,
      unitNo: tx.unit_no,
      amount: Number(tx.electricity_amount_rp) + Number(tx.water_amount_rp),
      electricityAmountRp: Number(tx.electricity_amount_rp),
      waterAmountRp: Number(tx.water_amount_rp),
      method: tx.method,
      status: tx.status,
      gatewayReference: tx.gateway_reference,
      createdAt: ensureIso(tx.created_at),
      confirmedAt: ensureIso(tx.confirmed_at),
    };
  }

  private formatInvoice(tx: Transaction): string {
    const lines = [
      'INVOICE TOKEN TOP-UP',
      `Transaction ID: ${tx.id}`,
      `Gateway Ref:    ${tx.gateway_reference ?? '-'}`,
      `Unit:           ${tx.unit_no}`,
      `Total:          Rp ${(Number(tx.electricity_amount_rp) + Number(tx.water_amount_rp)).toLocaleString('id-ID')}`,
      `Method:         ${tx.method}`,
      `Status:         ${tx.status}`,
      `Created:        ${tx.created_at?.toISOString()}`,
      `Confirmed:      ${tx.confirmed_at?.toISOString() ?? '-'}`,
    ];
    return lines.join('\n');
  }

  private verifyMidtransSignature(payload: any) {
    const serverKey = this.configService.get<string>('MIDTRANS_SERVER_KEY');
    const orderId = payload.order_id;
    const statusCode = payload.status_code;
    const grossAmount = payload.gross_amount;
    const signatureKey = payload.signature_key;

    const hash = createHash('sha512')
      .update(orderId + statusCode + grossAmount + serverKey)
      .digest('hex');

    if (hash !== signatureKey) {
      throw new UnauthorizedException('Invalid Midtrans Signature');
    }
  }
}
