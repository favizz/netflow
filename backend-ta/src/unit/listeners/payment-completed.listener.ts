import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentCompletedEvent } from '../../payments/events/payment-completed.event';
import { UnitService } from '../unit.service';
import { TariffService } from '../../tariff/tariff.service';

@Injectable()
export class PaymentCompletedListener {
  constructor(
    private readonly unitService: UnitService,
    private readonly tariffService: TariffService,
  ) {}

  @OnEvent('payment.completed', { async: true })
  async handle(event: PaymentCompletedEvent): Promise<void> {
    if (event.electricityAmountRp > 0) {
      const tariff = await this.tariffService.findCurrent('electricity');
      await this.unitService.creditTokensByUnitNo(
        event.unitNo,
        event.electricityAmountRp / tariff,
        'electricity',
      );
    }
    if (event.waterAmountRp > 0) {
      const tariff = await this.tariffService.findCurrent('water');
      await this.unitService.creditTokensByUnitNo(
        event.unitNo,
        event.waterAmountRp / tariff,
        'water',
      );
    }
  }
}
