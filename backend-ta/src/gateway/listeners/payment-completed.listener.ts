import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ClientProxy } from '@nestjs/microservices';
import { PaymentCompletedEvent } from '../../payments/events/payment-completed.event';
import { UnitService } from '../../admin/unit/unit.service';
import { encodeTopup, encodeCommand } from '../../common/binary-codec';
import { TopupDeliveryService } from '../../payments/topup-delivery.service';

@Injectable()
export class PaymentCompletedListener {
  private readonly logger = new Logger(PaymentCompletedListener.name);

  constructor(
    private readonly unitService: UnitService,
    private readonly topupDeliveryService: TopupDeliveryService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
  ) {}

  @OnEvent('payment.completed', { async: true })
  async handle(event: PaymentCompletedEvent): Promise<void> {
    try {
      const unit = await this.unitService.findByUnitNo(event.unitNo);
      if (!unit.device_id) return;
      const commandTimestamp = Math.floor(Date.now() / 1000);

      const payload = encodeTopup({
        electricAmount: event.electricityAmountRp,
        waterAmount: event.waterAmountRp,
        timestamp: commandTimestamp,
      });
      const payloadJson = {
        electricAmountRp: event.electricityAmountRp,
        waterAmountRp: event.waterAmountRp,
        timestamp: commandTimestamp,
      };

      await this.topupDeliveryService.createPending({
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

      this.mqttClient.emit(`device/${unit.device_id}/topup`, payload);
      await this.topupDeliveryService.markSent(
        event.transactionId,
        payloadJson,
      );
      if (event.electricityAmountRp > 0)
        this.mqttClient.emit(
          `device/${unit.device_id}/command`,
          encodeCommand('relay', 1),
        );
      if (event.waterAmountRp > 0)
        this.mqttClient.emit(
          `device/${unit.device_id}/command`,
          encodeCommand('valve', 1),
        );
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
