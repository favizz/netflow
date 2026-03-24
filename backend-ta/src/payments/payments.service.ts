import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { UnitService } from '../unit/unit.service';
import { Transaction } from './entities/transaction.entity';
import { InitiateTopupDto } from './dto/initiate-topup.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly unitService: UnitService,
    private readonly configService: ConfigService,
  ) {}

  async initiateTopup(dto: InitiateTopupDto) {
    const unit = await this.unitService.findByUnitNo(dto.unitNo);
    const id = `TRX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const gatewayReference = `PG-${Math.floor(100000 + Math.random() * 900000)}`;

    const tx = this.txRepo.create({
      id,
      unit_id: unit.id,
      unit_no: dto.unitNo,
      amount_rp: dto.amount,
      method: dto.method,
      status: 'pending',
      gateway_reference: gatewayReference,
    });

    await this.txRepo.save(tx);

    return {
      transactionId: id,
      gatewayReference,
      checkoutUrl: `/payments/checkout/${id}`,
      status: tx.status,
    };
  }

  async handleWebhook(dto: PaymentWebhookDto) {
    this.verifyWebhookSecurity(dto);

    // DB-level idempotency: if this event was already processed, return early
    const alreadyProcessed = await this.txRepo.findOne({ where: { webhook_event_id: dto.eventId } });
    if (alreadyProcessed) {
      return { ...this.toResponse(alreadyProcessed), idempotent: true };
    }

    const tx = await this.txRepo.findOne({ where: { id: dto.transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (tx.status === 'pending') {
      tx.status = dto.status;
      tx.webhook_event_id = dto.eventId;
      tx.confirmed_at = new Date();

      if (dto.status === 'success') {
        await this.unitService.creditBalanceByUnitNo(tx.unit_no, Number(tx.amount_rp));
      }

      await this.txRepo.save(tx);
    }

    return this.toResponse(tx);
  }

  async autoConfirm(transactionId: string) {
    const tx = await this.txRepo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (tx.status !== 'pending') return this.toResponse(tx);

    tx.status = 'success';
    tx.confirmed_at = new Date();
    await this.unitService.creditBalanceByUnitNo(tx.unit_no, Number(tx.amount_rp));
    await this.txRepo.save(tx);

    return this.toResponse(tx);
  }

  async listTransactionsForUnit(unitNo: string) {
    const txs = await this.txRepo.find({
      where: { unit_no: unitNo },
      order: { created_at: 'DESC' },
    });
    return txs.map((tx) => this.toResponse(tx));
  }

  async getTransaction(transactionId: string): Promise<Transaction> {
    const tx = await this.txRepo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async getTransactionForUnit(unitNo: string, transactionId: string): Promise<Transaction> {
    const tx = await this.getTransaction(transactionId);
    if (tx.unit_no !== unitNo) throw new ForbiddenException('Transaction does not belong to this unit');
    return tx;
  }

  async buildInvoice(transactionId: string): Promise<string> {
    const tx = await this.getTransaction(transactionId);
    return this.formatInvoice(tx);
  }

  async buildInvoiceForUnit(unitNo: string, transactionId: string): Promise<string> {
    const tx = await this.getTransactionForUnit(unitNo, transactionId);
    return this.formatInvoice(tx);
  }

  private toResponse(tx: Transaction) {
    return {
      id: tx.id,
      unitNo: tx.unit_no,
      amount: Number(tx.amount_rp),
      method: tx.method,
      status: tx.status,
      gatewayReference: tx.gateway_reference,
      createdAt: tx.created_at?.toISOString(),
      confirmedAt: tx.confirmed_at?.toISOString() ?? null,
    };
  }

  private formatInvoice(tx: Transaction): string {
    const lines = [
      'INVOICE TOKEN TOP-UP',
      `Transaction ID: ${tx.id}`,
      `Gateway Ref:    ${tx.gateway_reference ?? '-'}`,
      `Unit:           ${tx.unit_no}`,
      `Amount:         Rp ${Number(tx.amount_rp).toLocaleString('id-ID')}`,
      `Method:         ${tx.method}`,
      `Status:         ${tx.status}`,
      `Created:        ${tx.created_at?.toISOString()}`,
      `Confirmed:      ${tx.confirmed_at?.toISOString() ?? '-'}`,
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
