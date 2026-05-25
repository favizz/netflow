import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentCompletedEvent } from '../../../payments/events/payment-completed.event';
import { AuditLogService } from '../audit-log.service';

@Injectable()
export class PaymentCompletedListener {
  private readonly logger = new Logger(PaymentCompletedListener.name);

  constructor(private readonly auditLogService: AuditLogService) {}

  @OnEvent('payment.completed', { async: true })
  handle(event: PaymentCompletedEvent): void {
    const totalRp = event.electricityAmountRp + event.waterAmountRp;
    void this.auditLogService
      .log(
        'midtrans',
        'TOKEN_PURCHASE',
        'transaction',
        event.transactionId,
        { amount: totalRp, method: event.method, status: 'success' },
        'success',
      )
      .catch((err: Error) =>
        this.logger.error(
          `Audit log failed for txn ${event.transactionId}: ${err.message}`,
        ),
      );
  }
}
