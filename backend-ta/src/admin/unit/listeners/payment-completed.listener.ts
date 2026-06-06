import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentCompletedEvent } from '../../../payments/events/payment-completed.event';
import { UnitService } from '../unit.service';
import { TariffService } from '../../tariff/tariff.service';

@Injectable()
export class PaymentCompletedListener {
  private readonly logger = new Logger(PaymentCompletedListener.name);

  constructor(
    private readonly unitService: UnitService,
    private readonly tariffService: TariffService,
  ) {}

  @OnEvent('payment.completed', { async: true })
  async handle(event: PaymentCompletedEvent): Promise<void> {
    try {
      const elecTariff = await this.tariffService.findCurrent('electricity');
      const waterTariff = await this.tariffService.findCurrent('water');

      const elecRate = elecTariff?.price_per_unit || 1500;
      const waterRate = waterTariff?.price_per_unit || 5500;

      const addedKwh = event.electricityAmountRp / elecRate;
      const addedM3 = event.waterAmountRp / waterRate;

      await this.unitService.addTokens(event.unitNo, addedKwh, addedM3);
      
      this.logger.log(
        `Credited ${addedKwh.toFixed(3)} kWh and ${addedM3.toFixed(3)} m3 to unit ${event.unitNo} (txn: ${event.transactionId})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to credit tokens for unit ${event.unitNo} (txn: ${event.transactionId}): ${(err as Error).message}`,
      );
    }
  }
}
