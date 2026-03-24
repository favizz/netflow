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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitService } from '../unit/unit.service';
import { Transaction } from './entities/transaction.entity';
import { InitiateTopupDto } from './dto/initiate-topup.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
<<<<<<< HEAD

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
=======
import { Transaction } from './entities/transaction.entity';
import { Property } from '../unit/entities/property.entity';

@Injectable()
export class PaymentsService {
  private readonly processedEvents = new Set<string>();

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
    private readonly unitService: UnitService,
    private readonly configService: ConfigService,
  ) {}

  async initiateTopup(dto: InitiateTopupDto) {
<<<<<<< HEAD
    const unit = await this.unitService.findByUnitNo(dto.unitNo);
    const id = `TRX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
=======
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
    const gatewayReference = `PG-${Math.floor(100000 + Math.random() * 900000)}`;
    const property = await this.propertyRepo.findOne({ where: { unit_id: dto.unitNo } });
    
    // We allow topups even if property doesn't exist yet, by associating to unit_no via token_code temporarily if needed.
    // However, the schema expects user_id. We'll leave user_id null if no property is found.
    const userId = property ? property.user_id : null;

    const tx = this.txRepo.create({
<<<<<<< HEAD
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
=======
      user_id: userId || undefined,
      amount_rp: dto.amount,
      utility_type: 'electricity',
      status: 'pending',
      token_code: gatewayReference,
    });
    
    const saved = await this.txRepo.save(tx);

    return {
      transactionId: saved.transaction_id,
      gatewayReference,
      checkoutUrl: `/payments/checkout/${saved.transaction_id}`,
      status: saved.status,
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
    };
  }

  async handleWebhook(dto: PaymentWebhookDto) {
    this.verifyWebhookSecurity(dto);

<<<<<<< HEAD
    // DB-level idempotency: if this event was already processed, return early
    const alreadyProcessed = await this.txRepo.findOne({ where: { webhook_event_id: dto.eventId } });
    if (alreadyProcessed) {
      return { ...this.toResponse(alreadyProcessed), idempotent: true };
    }

    const tx = await this.txRepo.findOne({ where: { id: dto.transactionId } });
=======
    if (this.processedEvents.has(dto.eventId)) {
      const existingTx = await this.txRepo.findOne({ where: { transaction_id: dto.transactionId } });
      if (!existingTx) throw new NotFoundException('Transaction not found');
      return { ...existingTx, idempotent: true };
    }

    const tx = await this.txRepo.findOne({ where: { transaction_id: dto.transactionId } });
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
    if (!tx) throw new NotFoundException('Transaction not found');

    if (tx.status === 'pending') {
      tx.status = dto.status;
<<<<<<< HEAD
      tx.webhook_event_id = dto.eventId;
      tx.confirmed_at = new Date();

      if (dto.status === 'success') {
        await this.unitService.creditBalanceByUnitNo(tx.unit_no, Number(tx.amount_rp));
      }

      await this.txRepo.save(tx);
=======
      await this.txRepo.save(tx);

      if (dto.status === 'success' && tx.user_id) {
        const property = await this.propertyRepo.findOne({ where: { user_id: tx.user_id } });
        if (property) {
          await this.unitService.creditBalanceByUnitNo(property.unit_id, Number(tx.amount_rp));
        }
      }
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
    }

    return this.toResponse(tx);
  }

  async autoConfirm(transactionId: string) {
<<<<<<< HEAD
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
=======
    const tx = await this.txRepo.findOne({ where: { transaction_id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (tx.status !== 'pending') return tx;

    tx.status = 'success';
    await this.txRepo.save(tx);

    if (tx.user_id) {
      const property = await this.propertyRepo.findOne({ where: { user_id: tx.user_id } });
      if (property) {
        await this.unitService.creditBalanceByUnitNo(property.unit_id, Number(tx.amount_rp));
      }
    }

    return tx;
  }

  async listTransactionsForUnit(unitNo: string) {
    const property = await this.propertyRepo.findOne({ where: { unit_id: unitNo } });
    if (!property || !property.user_id) return [];
    
    return this.txRepo.find({
      where: { user_id: property.user_id },
      order: { transaction_date: 'DESC' },
    });
  }

  async getTransaction(transactionId: string) {
    const tx = await this.txRepo.findOne({ where: { transaction_id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async getTransactionForUnit(unitNo: string, transactionId: string) {
    const property = await this.propertyRepo.findOne({ where: { unit_id: unitNo } });
    if (!property) throw new NotFoundException('Property not found');

    const tx = await this.getTransaction(transactionId);
    if (tx.user_id !== property.user_id) {
      throw new ForbiddenException('Transaction does not belong to this unit');
    }
    return tx;
  }

  async buildInvoice(transactionId: string) {
    const tx = await this.getTransaction(transactionId);
    return this.formatInvoiceTemplate(tx);
  }

  async buildInvoiceForUnit(unitNo: string, transactionId: string) {
    const tx = await this.getTransactionForUnit(unitNo, transactionId);
    return this.formatInvoiceTemplate(tx);
  }

  private formatInvoiceTemplate(tx: Transaction) {
    const lines = [
      'INVOICE TOKEN TOP-UP',
      `Transaction ID: ${tx.transaction_id}`,
      `Gateway Ref: ${tx.token_code}`,
      `Amount: Rp ${Number(tx.amount_rp || 0).toLocaleString('id-ID')}`,
      `Status: ${tx.status}`,
      `Created: ${new Date(tx.transaction_date).toLocaleString()}`,
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
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
