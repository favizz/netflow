import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ResidentsService } from '../admin/residents/residents.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly telegramSendQueues = new Map<string, Promise<void>>();
  private readonly lastTelegramSendAt = new Map<string, number>();

  // TEMPORARILY DISABLED — set to true to re-enable all outgoing notifications
  // (email to residents/admins + Telegram). Disabled during fleet simulation to
  // avoid flooding inboxes with 2,500 simulated-device anomaly/offline alerts.
  private readonly notificationsEnabled = true;

  constructor(
    private readonly configService: ConfigService,
    private readonly residentsService: ResidentsService,
  ) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log('SMTP transporter configured.');
    } else {
      this.logger.warn(
        'SMTP not fully configured. Email notifications will only be logged.',
      );
    }
  }

  async sendTelegram(chatId: string, html: string): Promise<void> {
    if (!this.notificationsEnabled) return; // re-enable: set notificationsEnabled = true
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token || !chatId) return;
    const previousSend =
      this.telegramSendQueues.get(chatId) ?? Promise.resolve();
    const queuedSend = previousSend
      .catch(() => {})
      .then(() => this.sendTelegramQueued(chatId, html, token));

    this.telegramSendQueues.set(chatId, queuedSend);

    try {
      await queuedSend;
    } finally {
      if (this.telegramSendQueues.get(chatId) === queuedSend) {
        this.telegramSendQueues.delete(chatId);
      }
    }
  }

  private async sendTelegramQueued(
    chatId: string,
    html: string,
    token: string,
  ): Promise<void> {
    const lastSendAt = this.lastTelegramSendAt.get(chatId) ?? 0;
    const waitMs = 1_000 - (Date.now() - lastSendAt);
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }

    this.lastTelegramSendAt.set(chatId, Date.now());

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: html,
              parse_mode: 'HTML',
            }),
          },
        );
        if (res.ok) return;

        const body = await res.text();
        if (
          (res.status === 429 || res.status >= 500) &&
          attempt < MAX_RETRIES
        ) {
          const delayMs = attempt * 1_000;
          this.logger.warn(
            `Telegram sendMessage ${res.status} (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delayMs}ms: ${body}`,
          );
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        this.logger.warn(
          `Telegram sendMessage failed (${res.status}): ${body}`,
        );
        return;
      } catch (err) {
        this.logger.error(
          `Failed to send Telegram message: ${(err as Error).message}`,
        );
        return;
      }
    }
  }

  /**
   * Generic HTML notifier: sends a formatted HTML email + Telegram message to a resident.
   * Looks up the resident's telegram_chat_id from their email address.
   */
  async sendHtmlNotification(
    email: string,
    subject: string,
    htmlEmail: string,
    telegramHtml: string,
  ): Promise<void> {
    const [resident] = await Promise.allSettled([
      this.residentsService.findByEmail(email),
    ]);
    const chatId =
      resident.status === 'fulfilled'
        ? (resident.value?.telegram_chat_id ?? null)
        : null;

    await Promise.allSettled([
      this.sendEmailHtml(email, subject, htmlEmail),
      chatId ? this.sendTelegram(chatId, telegramHtml) : Promise.resolve(),
    ]);
  }

  private async sendEmail(
    email: string,
    subject: string,
    message: string,
  ): Promise<void> {
    if (!this.notificationsEnabled) return; // re-enable: set notificationsEnabled = true
    if (!this.transporter || !email) return;
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM'),
        to: email,
        subject,
        text: message,
        html: `<p style="font-family:sans-serif;line-height:1.6">${message.replace(/\n/g, '<br>')}</p>`,
      });
      this.logger.log(`Email successfully sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${email}:`, error);
    }
  }

  private async sendEmailHtml(
    email: string,
    subject: string,
    html: string,
  ): Promise<void> {
    if (!this.notificationsEnabled) return; // re-enable: set notificationsEnabled = true
    if (!this.transporter || !email) return;
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM'),
        to: email,
        subject,
        html,
      });
      this.logger.log(`Email (HTML) successfully sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${email}:`, error);
    }
  }
}
