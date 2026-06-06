import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentCompletedEvent } from '../../payments/events/payment-completed.event';
import { UnitService } from '../../admin/unit/unit.service';
import { TopupDeliveryService } from '../../payments/topup-delivery.service';
import { TopupDeliveryPublisherService } from '../topup-delivery-publisher.service';

@Injectable()
export class PaymentCompletedListener {
  private readonly logger = new Logger(PaymentCompletedListener.name);

  constructor(
    private readonly unitService: UnitService,
    private readonly topupDeliveryService: TopupDeliveryService,
    private readonly topupDeliveryPublisher: TopupDeliveryPublisherService,
  ) {}

  @OnEvent('payment.completed', { async: true })
  async handle(event: PaymentCompletedEvent): Promise<void> {
    try {
      const unit = await this.unitService.findByUnitNo(event.unitNo);
      if (!unit.device_id) return;
      const commandTimestamp = Math.floor(Date.now() / 1000);

      const payloadJson = {
        electricAmountRp: event.electricityAmountRp,
        waterAmountRp: event.waterAmountRp,
        timestamp: commandTimestamp,
      };

      const delivery = await this.topupDeliveryService.createPending({
        transactionId: event.transactionId,
        unitNo: event.unitNo,
        deviceId: unit.device_id,
        electricityAmountRp: event.electricityAmountRp,
        waterAmountRp: event.waterAmountRp,
        commandTimestamp,
        payload: payloadJson,
      });

      this.logger.log(
        `Pushing top-up to device [${unit.device_id}]: elec=Rp${event.electricityAmountRp} water=Rp${event.waterAmountRp}`,
      );

      await this.topupDeliveryPublisher.publishDelivery(delivery);
    } catch (err) {
      await this.topupDeliveryService.markFailed(
        event.transactionId,
        (err as Error).message,
      );
      this.logger.error(
        `Failed to push top-up command for unit ${event.unitNo} (txn: ${event.transactionId}): ${(err as Error).message}`,
      );
    }
  }
}
