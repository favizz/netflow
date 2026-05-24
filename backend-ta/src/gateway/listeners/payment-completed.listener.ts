import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ClientProxy } from '@nestjs/microservices';
import { PaymentCompletedEvent } from '../../payments/events/payment-completed.event';
import { UnitService } from '../../admin/unit/unit.service';
import { encodeTopup, encodeCommand } from '../../common/binary-codec';

@Injectable()
export class PaymentCompletedListener {
  private readonly logger = new Logger(PaymentCompletedListener.name);

  constructor(
    private readonly unitService: UnitService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
  ) {}

  @OnEvent('payment.completed', { async: true }) // eslint-disable-line @typescript-eslint/no-unsafe-call
  async handle(event: PaymentCompletedEvent): Promise<void> {
    const unit = await this.unitService.findByUnitNo(event.unitNo);
    if (!unit.device_id) return;

    const payload = encodeTopup({
      electricAmount: event.electricityAmountRp,
      waterAmount: event.waterAmountRp,
      timestamp: Math.floor(Date.now() / 1000),
    });

    this.logger.log(
      `Pushing top-up to device [${unit.device_id}]: elec=Rp${event.electricityAmountRp} water=Rp${event.waterAmountRp}`,
    );

    this.mqttClient.emit(`device/${unit.device_id}/topup`, payload);
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
  }
}
