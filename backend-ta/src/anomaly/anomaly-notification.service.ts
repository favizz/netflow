import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ANOMALY_DETECTION_CONFIG as CFG } from './anomaly.constants';
import type { AnomalyItem, AnomalyType } from './anomaly.types';
import { NotificationService } from '../notification/notification.service';
import { ResidentsService } from '../admin/residents/residents.service';
import { Resident } from '../admin/residents/resident.entity';

export interface OfflineUnitSummary {
  unitNumber: string;
  offlineDurationMinutes: number;
}

// ─── Per-type notification metadata ─────────────────────────────────────────

interface AnomalyMeta {
  icon: string;
  titleResident: string;
  titleAdmin: string;
  causeResident: string;
  causeAdmin: string;
  actionResident: string;
  actionAdmin: string;
}

const ANOMALY_META: Record<AnomalyType, AnomalyMeta> = {
  water_leak: {
    icon: '💧',
    titleResident: 'Indikasi Kebocoran Air',
    titleAdmin: 'Indikasi Kebocoran Air',
    causeResident:
      'Sistem mendeteksi aliran air terus-menerus dengan debit yang sangat stabil tanpa jeda. ' +
      'Pola ini tidak lazim pada penggunaan normal — kemungkinan ada kran yang tidak tertutup sempurna atau kebocoran pada instalasi pipa.',
    causeAdmin:
      'Koefisien variasi (CoV) aliran air sangat rendah di bawah 0,2 dengan debit rata-rata ≥0,3 L/menit — ' +
      'menunjukkan aliran konstan bukan penggunaan diskret seperti biasa.',
    actionResident:
      'Periksa semua kran dan sambungan pipa di unit Anda. Tutup katup utama jika sumber kebocoran tidak ditemukan, lalu segera hubungi pengelola gedung.',
    actionAdmin:
      'Verifikasi langsung ke unit. Jika penghuni tidak merespons, pertimbangkan menutup katup via panel admin.',
  },
  zero_flow: {
    icon: '🚰',
    titleResident: 'Tidak Ada Aliran Air',
    titleAdmin: 'Zero Flow Terdeteksi',
    causeResident:
      'Katup air Anda terbuka dan saldo token masih mencukupi, namun tidak ada air yang mengalir. ' +
      'Kemungkinan penyebab: gangguan suplai dari jaringan utama gedung atau pipa yang tersumbat.',
    causeAdmin:
      'Semua pembacaan flow dalam window terakhir ≤0,05 L/menit meskipun valve OPEN dan token positif. ' +
      'Periksa apakah beberapa unit mengalami masalah serupa (gangguan suplai massal).',
    actionResident:
      'Periksa apakah ada pengumuman pemadaman air dari pengelola. Jika hanya unit Anda yang bermasalah, hubungi teknisi untuk memeriksa kondisi pipa.',
    actionAdmin:
      'Cek apakah unit lain di jalur distribusi yang sama juga mengalami zero flow untuk membedakan gangguan pipa unit vs gangguan suplai gedung.',
  },
  backflow: {
    icon: '🔄',
    titleResident: 'Aliran Air Balik Terdeteksi',
    titleAdmin: 'Backflow Terdeteksi',
    causeResident:
      'Sensor mendeteksi air mengalir dengan arah terbalik pada meter Anda. ' +
      'Kondisi ini biasanya disebabkan oleh tekanan balik dari jaringan distribusi gedung atau kesalahan arah pemasangan meter air.',
    causeAdmin:
      'Nilai water_flow negatif terdeteksi pada pembacaan terbaru — aliran berlawanan dengan arah instalasi normal meter.',
    actionResident:
      'Segera hubungi teknisi gedung untuk memeriksa instalasi pipa dan posisi pemasangan meter air di unit Anda.',
    actionAdmin:
      'Lakukan inspeksi fisik instalasi. Pastikan arah pemasangan meter air sudah sesuai tanda panah aliran yang tertera pada body meter.',
  },
  low_electricity_token: {
    icon: '⚡',
    titleResident: 'Token Listrik Hampir Habis',
    titleAdmin: 'Token Listrik Hampir Habis',
    causeResident:
      'Saldo token listrik unit Anda mendekati nol berdasarkan konsumsi yang tercatat. ' +
      'Listrik akan diputus otomatis oleh sistem saat saldo mencapai nol.',
    causeAdmin:
      'Token listrik unit di bawah ambang batas 5 kWh. Sistem akan memutus relay saat token habis.',
    actionResident:
      'Segera lakukan pengisian token listrik melalui aplikasi NetFlow untuk mencegah pemadaman otomatis.',
    actionAdmin:
      'Pastikan penghuni sudah menerima notifikasi ini dan memiliki akses untuk melakukan pengisian.',
  },
  low_water_token: {
    icon: '💧',
    titleResident: 'Token Air Hampir Habis',
    titleAdmin: 'Token Air Hampir Habis',
    causeResident:
      'Saldo token air unit Anda mendekati nol berdasarkan konsumsi yang tercatat. ' +
      'Aliran air akan diputus otomatis oleh sistem saat saldo mencapai nol.',
    causeAdmin:
      'Token air unit di bawah ambang batas 1 m³. Sistem akan menutup valve saat token habis.',
    actionResident:
      'Segera lakukan pengisian token air melalui aplikasi NetFlow untuk mencegah penutupan otomatis.',
    actionAdmin:
      'Pastikan penghuni sudah menerima notifikasi ini dan memiliki akses untuk melakukan pengisian.',
  },
  mcb_trip: {
    icon: '⚡',
    titleResident: 'Beban Listrik Melebihi Kapasitas MCB',
    titleAdmin: 'Overcurrent MCB Terdeteksi',
    causeResident:
      'Konsumsi daya listrik di unit Anda melebihi batas aman MCB (1.300 W). ' +
      'Kondisi ini biasanya terjadi saat beberapa peralatan berdaya besar dinyalakan bersamaan, seperti AC, water heater, dan setrika.',
    causeAdmin:
      'Power terdeteksi melebihi 1.300 W — relay akan diputus otomatis untuk proteksi instalasi dari arus lebih.',
    actionResident:
      'Matikan beberapa peralatan listrik berdaya tinggi secara bergantian (AC, water heater, setrika). ' +
      'Sistem akan memulihkan aliran listrik secara otomatis setelah beban berkurang.',
    actionAdmin:
      'Periksa apakah relay berhasil memutus arus. Jika tidak ada respons dari perangkat, lakukan manual override dari panel admin.',
  },
  voltage_anomaly: {
    icon: '⚠️',
    titleResident: 'Tegangan Listrik Tidak Normal',
    titleAdmin: 'Voltage Anomaly Terdeteksi',
    causeResident:
      'Tegangan listrik yang terukur berada di luar rentang aman (198–242 V). ' +
      'Tegangan tidak normal dapat terjadi akibat gangguan pada jaringan distribusi PLN atau masalah instalasi gedung, ' +
      'dan berpotensi merusak peralatan elektronik sensitif.',
    causeAdmin:
      'Tegangan di luar rentang aman 198–242 V. Jika di bawah 180 V atau di atas 250 V, relay diputus otomatis oleh sistem.',
    actionResident:
      'Cabut atau matikan peralatan elektronik sensitif (laptop, TV, kulkas dengan kompressor) hingga tegangan kembali normal. ' +
      'Hubungi pengelola gedung jika kondisi berlanjut lebih dari beberapa menit.',
    actionAdmin:
      'Periksa kualitas suplai listrik dari panel distribusi gedung. Koordinasikan dengan PLN atau teknisi listrik jika diperlukan.',
  },
  low_power_factor: {
    icon: '📊',
    titleResident: 'Efisiensi Listrik Rendah',
    titleAdmin: 'Low Power Factor Terdeteksi',
    causeResident:
      'Peralatan di unit Anda mengonsumsi daya reaktif yang tinggi, ditandai dengan faktor daya rendah. ' +
      'Penyebab umum: penggunaan motor listrik, AC model lama, atau lampu neon dengan ballast konvensional yang tidak efisien.',
    causeAdmin:
      'Rasio daya aktif/daya semu (P/S) terdeteksi di bawah 0,6 dengan beban signifikan — ' +
      'menandakan konsumsi daya reaktif tinggi yang berpotensi membebani instalasi jaringan.',
    actionResident:
      'Pertimbangkan mengganti peralatan lama dengan yang berlabel "inverter" atau bertanda "high power factor". ' +
      'Konsultasikan dengan teknisi untuk kemungkinan pemasangan kapasitor koreksi faktor daya.',
    actionAdmin:
      'Catat sebagai temuan efisiensi. Koordinasikan dengan penghuni untuk penggantian peralatan jika kondisi berlanjut.',
  },
  usage_spike: {
    icon: '📈',
    titleResident: 'Lonjakan Konsumsi Listrik',
    titleAdmin: 'Usage Spike Terdeteksi',
    causeResident:
      'Konsumsi listrik unit Anda tiba-tiba melonjak jauh melebihi rata-rata penggunaan normal. ' +
      'Kondisi ini dapat disebabkan oleh peralatan berdaya besar yang baru dinyalakan, siklus defrost kulkas, atau kebocoran arus.',
    causeAdmin:
      'Konsumsi daya saat ini terdeteksi >3× rata-rata baseline 5 pembacaan terakhir, ' +
      'melebihi ambang minimum 500 W dengan baseline >100 W.',
    actionResident:
      'Periksa apakah ada peralatan yang tidak sengaja dinyalakan atau bekerja tidak normal. ' +
      'Jika tidak ada aktivitas yang menjelaskan lonjakan ini, segera hubungi teknisi.',
    actionAdmin:
      'Pantau apakah spike berlanjut. Jika konsisten, bisa mengindikasikan masalah instalasi atau kebocoran arus yang perlu pemeriksaan fisik.',
  },
  jailbreak: {
    icon: '🚨',
    titleResident: 'Peringatan Sistem',
    titleAdmin: 'Bypass Utilitas Terdeteksi',
    causeResident: 'Sistem mendeteksi anomali pada perangkat meter unit Anda.',
    causeAdmin:
      'Sensor masih mendeteksi konsumsi aktif (listrik/air) meskipun relay atau valve dalam status OFF akibat saldo habis. ' +
      'Ini mengindikasikan modifikasi ilegal pada instalasi meter atau bypass perangkat cutoff.',
    actionResident: 'Hubungi pengelola gedung untuk pemeriksaan lebih lanjut.',
    actionAdmin:
      'Lakukan inspeksi fisik segera ke unit terkait. Dokumentasikan temuan dan laporkan ke manajemen properti sesuai prosedur.',
  },
  device_offline: {
    icon: '📡',
    titleResident: 'Perangkat Meter Tidak Merespons',
    titleAdmin: 'Perangkat Offline',
    causeResident:
      'Perangkat meter di unit Anda tidak mengirimkan data ke sistem. ' +
      'Kemungkinan penyebab: koneksi WiFi terputus, gangguan daya pada perangkat, atau masalah koneksi jaringan.',
    causeAdmin:
      'Tidak ada data telemetri yang masuk dari perangkat dalam lebih dari 10 menit — ' +
      'MQTT broker tidak menerima paket dari device ID unit ini.',
    actionResident:
      'Periksa apakah router WiFi di sekitar perangkat meter berfungsi normal. ' +
      'Hubungi pengelola jika masalah berlanjut.',
    actionAdmin:
      'Periksa koneksi WiFi/Ethernet dan suplai daya perangkat di lokasi unit. ' +
      'Restart device atau cek konfigurasi router jika diperlukan.',
  },
  sensor_malfunction: {
    icon: '🔧',
    titleResident: 'Gangguan Sensor Perangkat',
    titleAdmin: 'Sensor Malfunction Terdeteksi',
    causeResident:
      'Sensor meter di unit Anda tidak menghasilkan data valid dalam beberapa waktu terakhir. ' +
      'Penggunaan listrik dan air Anda tidak terukur dengan akurat selama gangguan ini berlangsung. ' +
      'Kemungkinan penyebab: kabel sensor lepas, komponen hardware rusak, atau interferensi sinyal.',
    causeAdmin:
      'Semua nilai power, voltage, dan water_flow NULL dalam 10 pembacaan terakhir — ' +
      'data paket MQTT masuk tetapi tidak ada nilai sensor yang valid, mengindikasikan masalah pada sensor atau firmware perangkat.',
    actionResident:
      'Hubungi pengelola gedung untuk pemeriksaan fisik perangkat meter. ' +
      'Data konsumsi mungkin perlu diestimasi selama periode gangguan ini.',
    actionAdmin:
      'Lakukan inspeksi fisik perangkat: periksa koneksi sensor, kondisi hardware, dan firmware. ' +
      'Pertimbangkan penggantian perangkat jika kerusakan terkonfirmasi.',
  },
};

// ─── Email builder ────────────────────────────────────────────────────────────

function buildAnomalyEmailHtml(params: {
  anomaly: AnomalyItem;
  unitNumber: string;
  residentName: string;
  logoUrl?: string;
}): string {
  const { anomaly, unitNumber, residentName, logoUrl } = params;
  const meta = ANOMALY_META[anomaly.anomalyType];

  const isCritical = anomaly.severity === 'critical';
  const bannerBg = isCritical ? '#fef2f2' : '#fffbeb';
  const bannerBorder = isCritical ? '#fecaca' : '#fde68a';
  const bannerColor = isCritical ? '#dc2626' : '#d97706';
  const severityIcon = isCritical ? '&#128680;' : '&#9888;&#65039;';
  const severityLabel = isCritical ? 'KRITIS' : 'PERINGATAN';
  const severityBadgeBg = isCritical ? '#fee2e2' : '#fef3c7';
  const severityBadgeColor = isCritical ? '#dc2626' : '#d97706';

  const dateStr =
    new Date(anomaly.detectedAt).toLocaleString('id-ID', {
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
        <tr><td style="background:${bannerBg};padding:16px 32px;border-bottom:1px solid ${bannerBorder}">
          <p style="margin:0;font-size:15px;font-weight:600;color:${bannerColor}">${severityIcon}&nbsp; ${meta.titleResident}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 20px">Yth. <strong>${residentName}</strong>,</p>
          <p style="margin:0 0 24px;line-height:1.6;color:#555">
            Sistem NetFlow mendeteksi kondisi berikut pada Unit <strong>${unitNumber}</strong> yang memerlukan perhatian Anda.
          </p>

          <!-- Details table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px">
            <tr style="background:#f9fafb">
              <td style="padding:10px 16px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb" colspan="2">
                Detail Anomali
              </td>
            </tr>
            <tr><td style="padding:10px 16px;color:#555;width:40%;border-bottom:1px solid #f3f4f6">Unit</td><td style="padding:10px 16px;font-weight:600;color:#111;border-bottom:1px solid #f3f4f6">${unitNumber}</td></tr>
            <tr><td style="padding:10px 16px;color:#555;border-bottom:1px solid #f3f4f6">Jenis Anomali</td><td style="padding:10px 16px;color:#333;border-bottom:1px solid #f3f4f6">${meta.icon} ${meta.titleResident}</td></tr>
            <tr><td style="padding:10px 16px;color:#555;border-bottom:1px solid #f3f4f6">Tingkat</td>
              <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6">
                <span style="background:${severityBadgeBg};color:${severityBadgeColor};font-weight:700;padding:2px 10px;border-radius:12px;font-size:12px">${severityLabel}</span>
              </td>
            </tr>
            <tr><td style="padding:10px 16px;color:#555;border-bottom:1px solid #f3f4f6">Waktu Terdeteksi</td><td style="padding:10px 16px;color:#333;border-bottom:1px solid #f3f4f6">${dateStr}</td></tr>
            <tr><td style="padding:10px 16px;color:#555">Data Sensor</td><td style="padding:10px 16px;color:#333;font-size:13px">${anomaly.message}</td></tr>
          </table>

          <!-- Cause -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid #3b82f6;background:#eff6ff;border-radius:0 4px 4px 0;margin-bottom:12px">
            <tr><td style="padding:14px 16px">
              <p style="margin:0 0 6px;font-weight:700;color:#1d4ed8;font-size:13px">&#128221; Kemungkinan Penyebab</p>
              <p style="margin:0;color:#374151;line-height:1.7;font-size:13px">${meta.causeResident}</p>
            </td></tr>
          </table>

          <!-- Action -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid #16a34a;background:#f0fdf4;border-radius:0 4px 4px 0">
            <tr><td style="padding:14px 16px">
              <p style="margin:0 0 6px;font-weight:700;color:#15803d;font-size:13px">&#9989; Tindakan yang Disarankan</p>
              <p style="margin:0;color:#374151;line-height:1.7;font-size:13px">${meta.actionResident}</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
            Email ini dikirim secara otomatis oleh sistem NetFlow. Jika terdapat pertanyaan, hubungi pengelola gedung Anda.<br>
            &copy; NetFlow &mdash; Sistem Metering Utilitas Prabayar
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Telegram builder ─────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildAnomalyTelegramHtml(params: {
  anomaly: AnomalyItem;
  unitNumber: string;
  isAdmin: boolean;
}): string {
  const { anomaly, unitNumber, isAdmin } = params;
  const meta = ANOMALY_META[anomaly.anomalyType];
  const title = isAdmin ? meta.titleAdmin : meta.titleResident;
  const cause = isAdmin ? meta.causeAdmin : meta.causeResident;
  const action = isAdmin ? meta.actionAdmin : meta.actionResident;
  const headerPrefix = isAdmin
    ? '&#128680; <b>[Admin Alert]</b>'
    : '&#9888;&#65039; <b>[NetFlow Alert]</b>';

  const lines: string[] = [
    `${headerPrefix} ${escapeHtml(title)} &mdash; Unit <b>${escapeHtml(unitNumber)}</b>`,
    ``,
    escapeHtml(anomaly.message),
    ``,
    `&#128221; <b>Penyebab:</b> ${escapeHtml(cause)}`,
    ``,
    `&#9989; <b>Tindakan:</b> ${escapeHtml(action)}`,
  ];
  return lines.join('\n');
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AnomalyNotificationService {
  private readonly logger = new Logger(AnomalyNotificationService.name);
  private cachedAdminList: Resident[] | null = null;
  private adminListCachedAt = 0;
  private readonly adminAlertCooldownMap = new Map<string, number>();
  private readonly residentAlertCooldownMap = new Map<string, number>();

  constructor(
    private readonly notificationService: NotificationService,
    private readonly residentsService: ResidentsService,
    private readonly configService: ConfigService,
  ) {}

  async notifyResidentOfAnomaly(
    residentEmail: string,
    anomaly: AnomalyItem,
    unitNumber: string,
  ): Promise<void> {
    const cooldownKey = `${residentEmail}:${anomaly.anomalyType}`;
    const lastAlertTimestamp =
      this.residentAlertCooldownMap.get(cooldownKey) ?? 0;
    if (Date.now() - lastAlertTimestamp <= CFG.adminAlertCooldownMs) return;
    this.residentAlertCooldownMap.set(cooldownKey, Date.now());

    try {
      const resident = await this.residentsService.findByEmail(residentEmail);
      const residentName = resident?.name ?? 'Penghuni';

      const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? '';
      const logoUrl = frontendUrl
        ? `${frontendUrl}/netflow-logo-white.png`
        : undefined;

      const meta = ANOMALY_META[anomaly.anomalyType];
      const subject = `[NetFlow] ${meta.titleResident} — Unit ${unitNumber}`;

      const htmlEmail = buildAnomalyEmailHtml({
        anomaly,
        unitNumber,
        residentName,
        logoUrl,
      });

      const telegramHtml = buildAnomalyTelegramHtml({
        anomaly,
        unitNumber,
        isAdmin: false,
      });

      await this.notificationService
        .sendHtmlNotification(residentEmail, subject, htmlEmail, telegramHtml)
        .catch((error: unknown) => {
          this.logger.warn(
            `Resident notification failed for ${residentEmail}: ${(error as Error).message}`,
          );
        });
    } catch (error: unknown) {
      this.logger.warn(
        `Resident notification failed for ${residentEmail}: ${(error as Error).message}`,
      );
    }
  }

  async notifyAdminsOfAnomaly(
    anomaly: AnomalyItem,
    unitNumber: string,
  ): Promise<void> {
    const cooldownKey = anomaly.anomalyType;
    const lastAlertTimestamp = this.adminAlertCooldownMap.get(cooldownKey) ?? 0;
    const cooldownElapsed =
      Date.now() - lastAlertTimestamp > CFG.adminAlertCooldownMs;

    if (!cooldownElapsed) return;

    const admins = await this.getAdminList().catch(() => [] as Resident[]);
    const adminsWithTelegram = admins.filter(
      (admin): admin is Resident & { telegram_chat_id: string } =>
        admin.telegram_chat_id !== null && admin.telegram_chat_id !== undefined,
    );

    if (adminsWithTelegram.length === 0) return;

    this.adminAlertCooldownMap.set(cooldownKey, Date.now());

    const telegramMessage = buildAnomalyTelegramHtml({
      anomaly,
      unitNumber,
      isAdmin: true,
    });

    const sendPromises = adminsWithTelegram.map((admin) =>
      this.notificationService
        .sendTelegram(admin.telegram_chat_id, telegramMessage)
        .catch((error: unknown) => {
          this.logger.warn(
            `Admin Telegram notification failed for ${admin.email}: ${(error as Error).message}`,
          );
        }),
    );

    await Promise.allSettled(sendPromises);
  }

  async notifyAdminsOfOfflineUnits(
    offlineUnitSummaries: OfflineUnitSummary[],
  ): Promise<void> {
    if (offlineUnitSummaries.length === 0) return;

    const admins = await this.getAdminList().catch(() => [] as Resident[]);
    const adminsWithTelegram = admins.filter(
      (admin): admin is Resident & { telegram_chat_id: string } =>
        admin.telegram_chat_id !== null && admin.telegram_chat_id !== undefined,
    );

    if (adminsWithTelegram.length === 0) return;

    const telegramMessage =
      this.formatOfflineUnitsSummary(offlineUnitSummaries);

    const sendPromises = adminsWithTelegram.map((admin) =>
      this.notificationService
        .sendTelegram(admin.telegram_chat_id, telegramMessage)
        .catch((error: unknown) => {
          this.logger.warn(
            `Admin offline summary failed for ${admin.email}: ${(error as Error).message}`,
          );
        }),
    );

    await Promise.allSettled(sendPromises);
  }

  private async getAdminList(): Promise<Resident[]> {
    const cacheExpired =
      !this.cachedAdminList ||
      Date.now() - this.adminListCachedAt > CFG.adminCacheExpiryMs;

    if (cacheExpired) {
      this.cachedAdminList = await this.residentsService.findAdmins();
      this.adminListCachedAt = Date.now();
    }

    return this.cachedAdminList ?? [];
  }

  private formatOfflineUnitsSummary(
    offlineUnitSummaries: OfflineUnitSummary[],
  ): string {
    const meta = ANOMALY_META['device_offline'];

    if (offlineUnitSummaries.length === 1) {
      const { unitNumber, offlineDurationMinutes } = offlineUnitSummaries[0];
      const fakeAnomaly: AnomalyItem = {
        anomalyType: 'device_offline',
        severity: 'critical',
        target: 'admin',
        message: `Tidak ada data masuk selama ${offlineDurationMinutes} menit.`,
        metadata: { offlineDurationMinutes },
        detectedAt: new Date().toISOString(),
      };
      return buildAnomalyTelegramHtml({
        anomaly: fakeAnomaly,
        unitNumber,
        isAdmin: true,
      });
    }

    const maximumUnitsShown = 10;
    const shownUnits = offlineUnitSummaries
      .slice(0, maximumUnitsShown)
      .map((s) => s.unitNumber)
      .join(', ');
    const hiddenCount = offlineUnitSummaries.length - maximumUnitsShown;
    const hiddenSuffix = hiddenCount > 0 ? ` (+${hiddenCount} lainnya)` : '';

    return (
      `&#128680; <b>[Admin Alert] ${offlineUnitSummaries.length} Unit Offline</b>\n\n` +
      `Unit: ${escapeHtml(shownUnits)}${escapeHtml(hiddenSuffix)}\n\n` +
      `&#128221; <b>Penyebab:</b> ${escapeHtml(meta.causeAdmin)}\n\n` +
      `&#9989; <b>Tindakan:</b> ${escapeHtml(meta.actionAdmin)}`
    );
  }
}
