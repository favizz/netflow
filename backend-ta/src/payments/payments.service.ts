import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { UnitService } from '../unit/unit.service';
import { InitiateTopupDto } from './dto/initiate-topup.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';

export interface PaymentTransaction {
  id: string;
  unitNo: string;
  amount: number;
  method: 'qris' | 'transfer' | 'ewallet';
  status: 'pending' | 'success' | 'failed';
  createdAt: string;
  confirmedAt?: string;
  gatewayReference: string;
}

@Injectable()
export class PaymentsService {
  private readonly transactions = new Map<string, PaymentTransaction>();
  private readonly processedEvents = new Set<string>();

  constructor(
    private readonly unitService: UnitService,
    private readonly configService: ConfigService,
  ) {}

  initiateTopup(dto: InitiateTopupDto) {
    const transactionId = `TRX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const gatewayReference = `PG-${Math.floor(100000 + Math.random() * 900000)}`;

    const tx: PaymentTransaction = {
      id: transactionId,
      unitNo: dto.unitNo,
      amount: dto.amount,
      method: dto.method,
      status: 'pending',
      createdAt: new Date().toISOString(),
      gatewayReference,
    };

    this.transactions.set(transactionId, tx);

    return {
      transactionId,
      gatewayReference,
      checkoutUrl: `/payments/checkout/${transactionId}`,
      status: tx.status,
    };
  }

  async handleWebhook(dto: PaymentWebhookDto) {
    this.verifyWebhookSecurity(dto);

    if (this.processedEvents.has(dto.eventId)) {
      const existingTx = this.transactions.get(dto.transactionId);
      if (!existingTx) {
        throw new NotFoundException('Transaction not found');
      }
      return { ...existingTx, idempotent: true };
    }

    const tx = this.transactions.get(dto.transactionId);
    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }

    if (tx.status === 'pending') {
      tx.status = dto.status;
      tx.confirmedAt = new Date().toISOString();

      if (dto.status === 'success') {
        await this.unitService.creditBalanceByUnitNo(tx.unitNo, tx.amount);
      }

      this.transactions.set(tx.id, tx);
    }

    this.processedEvents.add(dto.eventId);
    return tx;
  }

  async autoConfirm(transactionId: string) {
    const tx = this.getTransaction(transactionId);

    if (tx.status !== 'pending') {
      return tx;
    }

    tx.status = 'success';
    tx.confirmedAt = new Date().toISOString();
    await this.unitService.creditBalanceByUnitNo(tx.unitNo, tx.amount);
    this.transactions.set(tx.id, tx);

    return tx;
  }

  listTransactionsForUnit(unitNo: string) {
    return [...this.transactions.values()]
      .filter((tx) => tx.unitNo === unitNo)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getTransaction(transactionId: string) {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }
    return tx;
  }

  getTransactionForUnit(unitNo: string, transactionId: string) {
    const tx = this.getTransaction(transactionId);
    if (tx.unitNo !== unitNo) {
      throw new ForbiddenException('Transaction does not belong to this unit');
    }
    return tx;
  }

  buildInvoice(transactionId: string) {
    const tx = this.getTransaction(transactionId);

    const lines = [
      'INVOICE TOKEN TOP-UP',
      `Transaction ID: ${tx.id}`,
      `Gateway Ref: ${tx.gatewayReference}`,
      `Unit: ${tx.unitNo}`,
      `Amount: Rp ${tx.amount.toLocaleString('id-ID')}`,
      `Method: ${tx.method}`,
      `Status: ${tx.status}`,
      `Created: ${tx.createdAt}`,
      `Confirmed: ${tx.confirmedAt ?? '-'}`,
    ];

    return lines.join('\n');
  }

  buildInvoiceForUnit(unitNo: string, transactionId: string) {
    const tx = this.getTransactionForUnit(unitNo, transactionId);

    const lines = [
      'INVOICE TOKEN TOP-UP',
      `Transaction ID: ${tx.id}`,
      `Gateway Ref: ${tx.gatewayReference}`,
      `Unit: ${tx.unitNo}`,
      `Amount: Rp ${tx.amount.toLocaleString('id-ID')}`,
      `Method: ${tx.method}`,
      `Status: ${tx.status}`,
      `Created: ${tx.createdAt}`,
      `Confirmed: ${tx.confirmedAt ?? '-'}`,
    ];

    return lines.join('\n');
  }

  private verifyWebhookSecurity(dto: PaymentWebhookDto) {
    const now = Date.now();
    const timestamp = Number(dto.timestamp);
    const maxSkewMs = Number(this.configService.get<string>('PAYMENT_WEBHOOK_MAX_SKEW_MS') || 300000);

    if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > maxSkewMs) {
      throw new UnauthorizedException('Webhook timestamp out of allowed window');
    }

    const secret = this.configService.get<string>('PAYMENT_WEBHOOK_SECRET') || 'change-me-webhook-secret';
    const canonicalPayload = `${dto.transactionId}|${dto.status}|${dto.eventId}|${dto.timestamp}`;

    const expected = createHmac('sha256', secret).update(canonicalPayload).digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(dto.signature, 'utf8');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}
