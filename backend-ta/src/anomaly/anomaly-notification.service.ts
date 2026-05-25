import { Injectable, Logger } from '@nestjs/common';
import { ANOMALY_DETECTION_CONFIG as CFG } from './anomaly.constants';
import type { AnomalyItem } from './anomaly.types';
import { NotificationService } from '../notification/notification.service';
import { ResidentsService } from '../admin/residents/residents.service';
import { Resident } from '../admin/residents/resident.entity';

export interface OfflineUnitSummary {
  unitNumber: string;
  offlineDurationMinutes: number;
}

/**
 * Handles all outbound notification dispatch for anomaly events.
 * Owns the admin list cache and per-anomaly-type Telegram cooldown map.
 * Has no knowledge of detection logic or database persistence.
 */
@Injectable()
export class AnomalyNotificationService {
  private readonly logger = new Logger(AnomalyNotificationService.name);
  private cachedAdminList: Resident[] | null = null;
  private adminListCachedAt = 0;
  private readonly adminAlertCooldownMap = new Map<string, number>();

  constructor(
    private readonly notificationService: NotificationService,
    private readonly residentsService: ResidentsService,
  ) {}

  /**
   * Sends an email and optional Telegram notification to the resident assigned to a unit.
   * Silently ignores notification failures to avoid disrupting the detection pipeline.
   *
   * @param residentEmail - Email address of the resident to notify.
   * @param anomaly - The detected anomaly item to describe in the notification.
   * @param unitNumber - Human-readable unit number for message context.
   * @returns Promise that resolves when dispatch completes or fails silently.
   */
  async notifyResidentOfAnomaly(
    residentEmail: string,
    anomaly: AnomalyItem,
    unitNumber: string,
  ): Promise<void> {
    const subject = `[NetFlow Alert] ${anomaly.anomalyType.toUpperCase()} — Unit ${unitNumber}`;
    await this.notificationService
      .sendResidentNotification(residentEmail, subject, anomaly.message)
      .catch((error: unknown) => {
        this.logger.warn(
          `Resident notification failed for ${residentEmail}: ${(error as Error).message}`,
        );
      });
  }

  /**
   * Sends a Telegram alert to all admin accounts for a new anomaly event.
   * Enforces a per-anomaly-type cooldown of 15 minutes to prevent alert fatigue.
   *
   * @param anomaly - The detected anomaly item triggering the admin alert.
   * @param unitNumber - Human-readable unit number for message context.
   * @returns Promise that resolves after all admin sends are attempted.
   */
  async notifyAdminsOfAnomaly(
    anomaly: AnomalyItem,
    unitNumber: string,
  ): Promise<void> {
    const cooldownKey = `${anomaly.anomalyType}:${unitNumber}`;
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

    const telegramMessage = `\u{1F6A8} *[Admin Alert]* ${anomaly.anomalyType.toUpperCase()} — Unit ${unitNumber}\n\n${anomaly.message}`;

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

  /**
   * Sends a single batched Telegram summary to all admins when multiple units
   * go offline simultaneously. Groups all offline events into one message to
   * prevent notification flooding when an upstream network failure affects many units.
   *
   * @param offlineUnitSummaries - List of units that newly went offline in this check cycle.
   * @returns Promise that resolves after all admin sends are attempted.
   */
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
    if (offlineUnitSummaries.length === 1) {
      const { unitNumber, offlineDurationMinutes } = offlineUnitSummaries[0];
      return `\u{1F6A8} *[Admin Alert]* DEVICE_OFFLINE — Unit ${unitNumber}\n\nTidak ada data masuk selama ${offlineDurationMinutes} menit.`;
    }

    const maximumUnitsShown = 10;
    const shownUnits = offlineUnitSummaries
      .slice(0, maximumUnitsShown)
      .map((summary) => summary.unitNumber)
      .join(', ');

    const hiddenCount = offlineUnitSummaries.length - maximumUnitsShown;
    const hiddenSuffix = hiddenCount > 0 ? ` (+${hiddenCount} lainnya)` : '';

    return `\u{1F6A8} ${offlineUnitSummaries.length} unit offline: ${shownUnits}${hiddenSuffix}`;
  }
}
