import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentCompletedEvent } from '../../../payments/events/payment-completed.event';

@Injectable()
export class PaymentCompletedListener {
  private readonly logger = new Logger(PaymentCompletedListener.name);

  @OnEvent('payment.completed', { async: true })
  handle(event: PaymentCompletedEvent): void {
    this.logger.log(
      `Token credit deferred to device telemetry for unit ${event.unitNo} (txn: ${event.transactionId})`,
    );
  }
}
