import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
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
      this.logger.warn('SMTP not fully configured. Notifications will only be logged.');
    }
  }

  async sendResidentNotification(
    email: string,
    subject: string,
    message: string,
  ): Promise<void> {
    this.logger.log(`[Notification] To: ${email} | Subject: ${subject} | Message: ${message}`);

    if (this.transporter && email) {
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
}
