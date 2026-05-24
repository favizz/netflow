import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Transaction } from './entities/transaction.entity';
import { AuditLogService } from '../admin/audit-log/audit-log.service';

export const PAYMENT_EXPIRY_QUEUE = 'payment-expiry';

@Processor(PAYMENT_EXPIRY_QUEUE)
export class PaymentExpiryProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(PaymentExpiryProcessor.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly auditLogService: AuditLogService,
  ) {
    super();
  }

  onApplicationBootstrap() {
    this.worker?.on('error', (err: Error) => {
      this.logger.warn(
        `Payment expiry worker error (Redis may be unavailable): ${err.message}`,
      );
    });
  }

  async process(job: Job<{ transactionId: string }>): Promise<void> {
    const { transactionId } = job.data;
    const tx = await this.txRepo.findOne({ where: { id: transactionId } });

    if (!tx || tx.status !== 'pending') return; // already settled or not found

    tx.status = 'failed';
    await this.txRepo.save(tx);

    this.logger.log(`Payment ${transactionId} auto-expired (30 min timeout)`);
    void this.auditLogService.log(
      'expiry',
      'TOKEN_PURCHASE',
      'transaction',
      transactionId,
      {
        amount: Number(tx.electricity_amount_rp) + Number(tx.water_amount_rp),
        method: tx.method,
        status: 'failed',
        reason: 'expired',
      },
      'failure',
    );
  }
}
