import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ResidentsService } from '../residents/residents.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: nodemailer.Transporter | null = null;

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

  async sendResidentNotification(
    email: string,
    subject: string,
    message: string,
  ): Promise<void> {
    this.logger.log(
      `[Notification] To: ${email} | Subject: ${subject} | Message: ${message}`,
    );

    const [resident] = await Promise.allSettled([
      this.residentsService.findByEmail(email),
    ]);
    const chatId =
      resident.status === 'fulfilled'
        ? (resident.value?.telegram_chat_id ?? null)
        : null;

    await Promise.allSettled([
      this.sendEmail(email, subject, message),
      chatId
        ? this.sendTelegram(
            chatId,
            `⚠️ <b>${escapeHtml(subject)}</b>\n\n${escapeHtml(message)}`,
          )
        : Promise.resolve(),
    ]);
  }

  async sendTelegram(chatId: string, html: string): Promise<void> {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token || !chatId) return;
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
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(
          `Telegram sendMessage failed (${res.status}): ${body}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to send Telegram message: ${(err as Error).message}`,
      );
    }
  }

  private async sendEmail(
    email: string,
    subject: string,
    message: string,
  ): Promise<void> {
    if (!this.transporter || !email) return;
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM'),
        to: email,
        subject,
        text: message,
        html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
      });
      this.logger.log(`Email successfully sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${email}:`, error);
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
