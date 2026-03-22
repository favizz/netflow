import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitService } from '../unit/unit.service';
import { InitiateTopupDto } from './dto/initiate-topup.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
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
    private readonly unitService: UnitService,
    private readonly configService: ConfigService,
  ) {}

  async initiateTopup(dto: InitiateTopupDto) {
    const gatewayReference = `PG-${Math.floor(100000 + Math.random() * 900000)}`;
    const property = await this.propertyRepo.findOne({ where: { unit_id: dto.unitNo } });
    
    // We allow topups even if property doesn't exist yet, by associating to unit_no via token_code temporarily if needed.
    // However, the schema expects user_id. We'll leave user_id null if no property is found.
    const userId = property ? property.user_id : null;

    const tx = this.txRepo.create({
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
    };
  }

  async handleWebhook(dto: PaymentWebhookDto) {
    this.verifyWebhookSecurity(dto);

    if (this.processedEvents.has(dto.eventId)) {
      const existingTx = await this.txRepo.findOne({ where: { transaction_id: dto.transactionId } });
      if (!existingTx) throw new NotFoundException('Transaction not found');
      return { ...existingTx, idempotent: true };
    }

    const tx = await this.txRepo.findOne({ where: { transaction_id: dto.transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (tx.status === 'pending') {
      tx.status = dto.status;
      await this.txRepo.save(tx);

      if (dto.status === 'success' && tx.user_id) {
        const property = await this.propertyRepo.findOne({ where: { user_id: tx.user_id } });
        if (property) {
          await this.unitService.creditBalanceByUnitNo(property.unit_id, Number(tx.amount_rp));
        }
      }
    }

    this.processedEvents.add(dto.eventId);
    return tx;
  }

  async autoConfirm(transactionId: string) {
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
