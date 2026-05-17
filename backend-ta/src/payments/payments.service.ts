/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { UnitService } from '../unit/unit.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { Transaction } from './entities/transaction.entity';
import { InitiateTopupDto } from './dto/initiate-topup.dto';
import { PAYMENT_EXPIRY_QUEUE } from './payment-expiry.processor';
import { createHash } from 'crypto';
import { ClientProxy } from '@nestjs/microservices';
import { encodeTopup } from '../common/binary-codec';

const PAYMENT_EXPIRY_MS = 30 * 60 * 1_000; // 30 minutes

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly unitService: UnitService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
    @InjectQueue(PAYMENT_EXPIRY_QUEUE)
    private readonly expiryQueue: Queue,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
    private readonly notificationService: NotificationService,
  ) {}

  async initiateTopup(dto: InitiateTopupDto) {
    const unit = await this.unitService.findByUnitNo(dto.unitNo);
    const id = `TRX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

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

    const paymentParams: any = {
      payment_type: dto.method === 'transfer' ? 'bank_transfer' : 'gopay',
      transaction_details: {
        order_id: id,
        gross_amount: totalAmount,
      },
      customer_details: {
        first_name: 'Unit',
        last_name: dto.unitNo,
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
        unit_id: unit.id,
        unit_no: dto.unitNo,
        amount_rp: totalAmount,
        electricity_amount_rp: dto.electricityAmount,
        water_amount_rp: dto.waterAmount,
        method: dto.method,
        status: 'pending',
        gateway_reference: mResponse.transaction_id || mResponse.order_id,
      });

      await this.txRepo.save(tx);

      void this.auditLogService.log(
        `unit:${dto.unitNo}`,
        'TOKEN_PURCHASE',
        'transaction',
        id,
        {
          electricity_amount: dto.electricityAmount,
          water_amount: dto.waterAmount,
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
      return { ...this.toResponse(alreadyProcessed), idempotent: true };
    }

    const tx = await this.txRepo.findOne({ where: { id: dto.order_id } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (tx.status === 'pending') {
      let finalStatus: 'pending' | 'success' | 'failed' = 'pending';
      const mStatus = dto.transaction_status;
      const fStatus = dto.fraud_status;

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
      } else if (mStatus === 'pending') {
        finalStatus = 'pending';
      }

      tx.status = finalStatus;
      tx.webhook_event_id = eventId;

      if (finalStatus === 'success') {
        tx.confirmed_at = new Date();
        const updatedUnit = await this.unitService.creditBalanceByUnitNo(
          tx.unit_no,
          Number(tx.amount_rp),
        );
        if (updatedUnit.device_id) {
          const payload = encodeTopup({
            electricAmount: Number(tx.electricity_amount_rp),
            waterAmount: Number(tx.water_amount_rp),
            timestamp: Math.floor(Date.now() / 1000),
          });
          this.logger.log(
            `Pushing top-up to device [${updatedUnit.device_id}]: elec=Rp${tx.electricity_amount_rp} water=Rp${tx.water_amount_rp}`,
          );
          this.mqttClient.emit(
            `device/${updatedUnit.device_id}/topup`,
            payload,
          );
        }
        if (updatedUnit.resident_email) {
          const elecLine =
            Number(tx.electricity_amount_rp) > 0
              ? `⚡ Listrik: Rp ${Number(tx.electricity_amount_rp).toLocaleString('id-ID')}\n`
              : '';
          const waterLine =
            Number(tx.water_amount_rp) > 0
              ? `💧 Air: Rp ${Number(tx.water_amount_rp).toLocaleString('id-ID')}\n`
              : '';
          void this.notificationService
            .sendResidentNotification(
              updatedUnit.resident_email,
              `[NetFlow] Top-up Berhasil — Unit ${tx.unit_no}`,
              `✅ Pembayaran Rp ${Number(tx.amount_rp).toLocaleString('id-ID')} berhasil dikonfirmasi.\n\n${elecLine}${waterLine}\nUnit: ${tx.unit_no}\nMetode: ${tx.method}\nID Transaksi: ${tx.id}\n\nSaldo akan segera diperbarui.`,
            )
            .catch(() => {});
        }
      }

      await this.txRepo.save(tx);

      if (finalStatus !== 'pending') {
        void this.auditLogService.log(
          'system:midtrans',
          'TOKEN_PURCHASE',
          'transaction',
          tx.id,
          {
            amount: Number(tx.amount_rp),
            method: tx.method,
            status: finalStatus,
            gateway_status: mStatus,
          },
          finalStatus === 'success' ? 'success' : 'failure',
        );
      }
    }

    return this.toResponse(tx);
  }

  async autoConfirm(transactionId: string) {
    const tx = await this.txRepo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (tx.status !== 'pending') return this.toResponse(tx);

    tx.status = 'success';
    tx.confirmed_at = new Date();
    const updatedUnit = await this.unitService.creditBalanceByUnitNo(
      tx.unit_no,
      Number(tx.amount_rp),
    );
    if (updatedUnit.device_id) {
      const payload = encodeTopup({
        electricAmount: Number(tx.electricity_amount_rp),
        waterAmount: Number(tx.water_amount_rp),
        timestamp: Math.floor(Date.now() / 1000),
      });
      this.logger.log(
        `Pushing top-up to device [${updatedUnit.device_id}]: elec=Rp${tx.electricity_amount_rp} water=Rp${tx.water_amount_rp}`,
      );
      this.mqttClient.emit(`device/${updatedUnit.device_id}/topup`, payload);
    }
    if (updatedUnit.resident_email) {
      const elecLine =
        Number(tx.electricity_amount_rp) > 0
          ? `⚡ Listrik: Rp ${Number(tx.electricity_amount_rp).toLocaleString('id-ID')}\n`
          : '';
      const waterLine =
        Number(tx.water_amount_rp) > 0
          ? `💧 Air: Rp ${Number(tx.water_amount_rp).toLocaleString('id-ID')}\n`
          : '';
      void this.notificationService
        .sendResidentNotification(
          updatedUnit.resident_email,
          `[NetFlow] Top-up Berhasil — Unit ${tx.unit_no}`,
          `✅ Pembayaran Rp ${Number(tx.amount_rp).toLocaleString('id-ID')} berhasil dikonfirmasi.\n\n${elecLine}${waterLine}\nUnit: ${tx.unit_no}\nMetode: ${tx.method}\nID Transaksi: ${tx.id}\n\nSaldo akan segera diperbarui.`,
        )
        .catch(() => {});
    }
    await this.txRepo.save(tx);

    void this.auditLogService.log(
      `unit:${tx.unit_no}`,
      'TOKEN_PURCHASE',
      'transaction',
      tx.id,
      { amount: Number(tx.amount_rp), method: tx.method, status: 'success' },
      'success',
    );

    return this.toResponse(tx);
  }

  async getTopupStatus(unitNo: string, transactionId: string) {
    const tx = await this.getTransactionForUnit(unitNo, transactionId);
    return {
      status: tx.status,
      confirmedAt: tx.confirmed_at?.toISOString() ?? null,
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
      amount: Number(tx.amount_rp),
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
      `Electricity:    Rp ${Number(tx.electricity_amount_rp).toLocaleString('id-ID')}`,
      `Water:          Rp ${Number(tx.water_amount_rp).toLocaleString('id-ID')}`,
      `Total:          Rp ${Number(tx.amount_rp).toLocaleString('id-ID')}`,
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
