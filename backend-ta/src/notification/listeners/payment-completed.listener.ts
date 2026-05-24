import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentCompletedEvent } from '../../payments/events/payment-completed.event';
import { UnitService } from '../../admin/unit/unit.service';
import { NotificationService } from '../notification.service';

@Injectable()
export class PaymentCompletedListener {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly unitService: UnitService,
  ) {}

  @OnEvent('payment.completed', { async: true }) // eslint-disable-line @typescript-eslint/no-unsafe-call
  async handle(event: PaymentCompletedEvent): Promise<void> {
    const unit = await this.unitService.findByUnitNo(event.unitNo);
    if (!unit.resident_email) return;

    const totalRp = event.electricityAmountRp + event.waterAmountRp;
    await this.notificationService
      .sendResidentNotification(
        unit.resident_email,
        `[NetFlow] Top-up Berhasil — Unit ${event.unitNo}`,
        `✅ Pembayaran Rp ${totalRp.toLocaleString('id-ID')} berhasil dikonfirmasi.\n\n` +
          `Unit: ${event.unitNo}\n` +
          `Listrik: Rp ${event.electricityAmountRp.toLocaleString('id-ID')}\n` +
          `Air: Rp ${event.waterAmountRp.toLocaleString('id-ID')}\n` +
          `ID Transaksi: ${event.transactionId}\n\n` +
          `Token Anda akan segera diperbarui.`,
      )
      .catch(() => {});
  }
}
