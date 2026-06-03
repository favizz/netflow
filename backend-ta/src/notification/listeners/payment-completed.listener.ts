import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PaymentCompletedEvent } from '../../payments/events/payment-completed.event';
import { UnitService } from '../../admin/unit/unit.service';
import { ResidentsService } from '../../admin/residents/residents.service';
import { TariffService } from '../../admin/tariff/tariff.service';
import { NotificationService } from '../notification.service';

const METHOD_LABEL: Record<string, string> = {
  qris: 'QRIS',
  transfer: 'BCA Virtual Account',
  ewallet: 'Dompet Digital',
};

function rp(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function buildEmailHtml(params: {
  name: string;
  unitNo: string;
  transactionId: string;
  method: string;
  electricityRp: number;
  waterRp: number;
  totalRp: number;
  electricityKwh: number;
  waterM3: number;
  timestamp: Date;
  logoUrl?: string;
}): string {
  const {
    name,
    unitNo,
    transactionId,
    method,
    electricityRp,
    waterRp,
    totalRp,
    electricityKwh,
    waterM3,
    timestamp,
    logoUrl,
  } = params;

  const dateStr =
    timestamp.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB';

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="NetFlow" height="36" style="display:block;border:0;max-height:36px;margin-bottom:6px">`
    : `<p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px">NETFLOW</p>`;

  const tokenRows: string[] = [];
  if (electricityRp > 0) {
    tokenRows.push(
      `<tr><td style="padding:8px 16px;color:#555;border-bottom:1px solid #f3f4f6">&#9889; Token Listrik</td>` +
        `<td style="padding:8px 16px;text-align:right;color:#333;border-bottom:1px solid #f3f4f6">` +
        `<strong>${electricityKwh.toFixed(2)} kWh</strong><br><span style="font-size:12px;color:#6b7280">${rp(electricityRp)}</span></td></tr>`,
    );
  }
  if (waterRp > 0) {
    tokenRows.push(
      `<tr><td style="padding:8px 16px;color:#555;border-bottom:1px solid #f3f4f6">&#128167; Token Air</td>` +
        `<td style="padding:8px 16px;text-align:right;color:#333;border-bottom:1px solid #f3f4f6">` +
        `<strong>${waterM3.toFixed(3)} m&#179;</strong><br><span style="font-size:12px;color:#6b7280">${rp(waterRp)}</span></td></tr>`,
    );
  }

  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;font-size:14px;color:#333">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%">

        <!-- Header -->
        <tr><td style="background:#1d4ed8;padding:24px 32px">
          ${logoHtml}
          <p style="margin:4px 0 0;font-size:12px;color:#93c5fd">Sistem Metering Utilitas Prabayar</p>
        </td></tr>

        <!-- Status banner -->
        <tr><td style="background:#f0fdf4;padding:16px 32px;border-bottom:1px solid #dcfce7">
          <p style="margin:0;font-size:15px;font-weight:600;color:#15803d">&#10003;&nbsp; Pengisian Token Berhasil</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 20px">Yth. <strong>${name}</strong>,</p>
          <p style="margin:0 0 24px;line-height:1.6;color:#555">
            Pembayaran token utilitas Anda untuk Unit <strong>${unitNo}</strong> telah berhasil diproses.
            Token berikut telah dikreditkan ke akun Anda:
          </p>

          <!-- Token received -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin-bottom:24px">
            <tr style="background:#f9fafb"><td style="padding:10px 16px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb" colspan="2">Token Diterima</td></tr>
            ${tokenRows.join('')}
            <tr style="border-top:2px solid #e5e7eb"><td style="padding:10px 16px;font-weight:700;color:#111">Total Pembayaran</td><td style="padding:10px 16px;text-align:right;font-weight:700;font-size:16px;color:#1d4ed8">${rp(totalRp)}</td></tr>
          </table>

          <!-- Transaction info -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px">
            <tr style="background:#f9fafb"><td style="padding:10px 16px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb" colspan="2">Informasi Transaksi</td></tr>
            <tr><td style="padding:10px 16px;color:#555;border-bottom:1px solid #f3f4f6">Nomor Referensi</td><td style="padding:10px 16px;font-family:monospace;font-size:13px;color:#1d4ed8;border-bottom:1px solid #f3f4f6">${transactionId}</td></tr>
            <tr><td style="padding:10px 16px;color:#555;border-bottom:1px solid #f3f4f6">Tanggal &amp; Waktu</td><td style="padding:10px 16px;color:#333;border-bottom:1px solid #f3f4f6">${dateStr}</td></tr>
            <tr><td style="padding:10px 16px;color:#555;border-bottom:1px solid #f3f4f6">Metode Pembayaran</td><td style="padding:10px 16px;color:#333;border-bottom:1px solid #f3f4f6">${METHOD_LABEL[method] ?? method}</td></tr>
            <tr><td style="padding:10px 16px;color:#555">Status</td><td style="padding:10px 16px"><span style="background:#dcfce7;color:#15803d;font-weight:700;padding:2px 10px;border-radius:12px;font-size:12px">LUNAS</span></td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
            Email ini dikirim secara otomatis oleh sistem NetFlow. Jika terdapat ketidaksesuaian data, balas email ini dengan menyertakan nomor referensi di atas.<br>
            &copy; NetFlow &mdash; Sistem Metering Utilitas Prabayar
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildTelegramHtml(params: {
  name: string;
  unitNo: string;
  transactionId: string;
  method: string;
  electricityRp: number;
  waterRp: number;
  totalRp: number;
  electricityKwh: number;
  waterM3: number;
}): string {
  const {
    name,
    unitNo,
    transactionId,
    method,
    electricityRp,
    waterRp,
    totalRp,
    electricityKwh,
    waterM3,
  } = params;
  const lines: string[] = [
    `&#9989; <b>Pengisian Token Berhasil</b>`,
    `Unit <b>${unitNo}</b> &mdash; ${name}`,
    ``,
  ];
  if (electricityRp > 0) {
    lines.push(
      `&#9889; Token Listrik: <b>${electricityKwh.toFixed(2)} kWh</b> <i>(${rp(electricityRp)})</i>`,
    );
  }
  if (waterRp > 0) {
    lines.push(
      `&#128167; Token Air: <b>${waterM3.toFixed(3)} m&#179;</b> <i>(${rp(waterRp)})</i>`,
    );
  }
  lines.push(`&#128176; <b>Total: ${rp(totalRp)}</b>`);
  lines.push(``);
  lines.push(`&#128203; Metode: ${METHOD_LABEL[method] ?? method}`);
  lines.push(`&#128273; Ref: <code>${transactionId}</code>`);
  return lines.join('\n');
}

@Injectable()
export class PaymentCompletedListener {
  private readonly logger = new Logger(PaymentCompletedListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly unitService: UnitService,
    private readonly residentsService: ResidentsService,
    private readonly tariffService: TariffService,
    private readonly configService: ConfigService,
  ) {}

  @OnEvent('payment.completed', { async: true })
  async handle(event: PaymentCompletedEvent): Promise<void> {
    try {
      const unit = await this.unitService.findByUnitNo(event.unitNo);
      if (!unit.resident_email) return;

      const resident = await this.residentsService.findByEmail(
        unit.resident_email,
      );
      const name = resident?.name ?? 'Penghuni';
      const totalRp = event.electricityAmountRp + event.waterAmountRp;

      const [elecTariff, waterTariff] = await Promise.all([
        event.electricityAmountRp > 0
          ? this.tariffService.findCurrent('electricity')
          : Promise.resolve(1),
        event.waterAmountRp > 0
          ? this.tariffService.findCurrent('water')
          : Promise.resolve(1),
      ]);

      const electricityKwh =
        event.electricityAmountRp > 0
          ? event.electricityAmountRp / elecTariff
          : 0;
      const waterM3 =
        event.waterAmountRp > 0 ? event.waterAmountRp / waterTariff : 0;

      const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? '';
      const logoUrl = frontendUrl
        ? `${frontendUrl}/netflow-logo-white.png`
        : undefined;

      const subject = `Pengisian Token Unit ${event.unitNo} Berhasil`;

      const htmlEmail = buildEmailHtml({
        name,
        unitNo: event.unitNo,
        transactionId: event.transactionId,
        method: event.method,
        electricityRp: event.electricityAmountRp,
        waterRp: event.waterAmountRp,
        totalRp,
        electricityKwh,
        waterM3,
        timestamp: event.timestamp,
        logoUrl,
      });

      const telegramHtml = buildTelegramHtml({
        name,
        unitNo: event.unitNo,
        transactionId: event.transactionId,
        method: event.method,
        electricityRp: event.electricityAmountRp,
        waterRp: event.waterAmountRp,
        totalRp,
        electricityKwh,
        waterM3,
      });

      await this.notificationService.sendHtmlNotification(
        unit.resident_email,
        subject,
        htmlEmail,
        telegramHtml,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send payment notification for unit ${event.unitNo} (txn: ${event.transactionId}): ${(err as Error).message}`,
      );
    }
  }
}
