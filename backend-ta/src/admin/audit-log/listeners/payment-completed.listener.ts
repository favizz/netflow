import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentCompletedEvent } from '../../../payments/events/payment-completed.event';
import { AuditLogService } from '../audit-log.service';

@Injectable()
export class PaymentCompletedListener {
  constructor(private readonly auditLogService: AuditLogService) {}

  @OnEvent('payment.completed', { async: true }) // eslint-disable-line @typescript-eslint/no-unsafe-call
  handle(event: PaymentCompletedEvent): void {
    const totalRp = event.electricityAmountRp + event.waterAmountRp;
    void this.auditLogService.log(
      'midtrans',
      'TOKEN_PURCHASE',
      'transaction',
      event.transactionId,
      { amount: totalRp, method: event.method, status: 'success' },
      'success',
    );
  }
}
