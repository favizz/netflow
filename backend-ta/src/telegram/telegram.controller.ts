import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ResidentsService } from '../admin/residents/residents.service';
import { NotificationService } from '../notification/notification.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; username?: string; first_name?: string };
    chat: { id: number };
    text?: string;
  };
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);
  // In-memory state: chatId → 'awaiting_email'
  private readonly pending = new Map<number, true>();

  constructor(
    private readonly residentsService: ResidentsService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretHeader?: string,
  ): Promise<void> {
    const expectedSecret = this.configService.get<string>(
      'TELEGRAM_WEBHOOK_SECRET',
    );
    if (expectedSecret && secretHeader !== expectedSecret) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }
    const msg = update.message;
    if (!msg?.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const firstName = msg.from.first_name ?? 'there';

    // /start command — enter linking flow
    if (text === '/start' || text.startsWith('/start ')) {
      this.pending.set(chatId, true);
      await this.reply(
        chatId,
        `&#128075; Halo, <b>${esc(firstName)}</b>! Saya adalah bot notifikasi NetFlow.\n\n` +
          `Balas pesan ini dengan <b>alamat email terdaftar</b> Anda untuk menghubungkan akun Telegram ini dan mulai menerima notifikasi.`,
      );
      return;
    }

    // /unlink command
    if (text === '/unlink') {
      const resident = await this.residentsService.findByTelegramChatId(
        String(chatId),
      );
      if (resident) {
        await this.residentsService.setTelegramChatId(resident.email, null);
        await this.reply(
          chatId,
          '&#9989; Akun Telegram Anda telah berhasil dilepas dari NetFlow.',
        );
      } else {
        await this.reply(
          chatId,
          'Tidak ada akun NetFlow yang tertaut dengan Telegram ini.',
        );
      }
      return;
    }

    // If we're waiting for an email from this chat
    if (this.pending.has(chatId)) {
      const email = text.toLowerCase().trim();

      if (!email.includes('@')) {
        await this.reply(
          chatId,
          '&#10060; Format email tidak valid. Silakan coba lagi.',
        );
        return;
      }

      const resident = await this.residentsService.findByEmail(email);
      if (!resident) {
        await this.reply(
          chatId,
          `&#10060; Akun dengan email <b>${esc(email)}</b> tidak ditemukan.\n\nPastikan email yang Anda masukkan sesuai dengan yang didaftarkan oleh pengelola gedung.`,
        );
        return;
      }

      this.pending.delete(chatId);
      await this.residentsService.setTelegramChatId(email, String(chatId));
      this.logger.log(`Telegram linked: ${email} → chatId ${chatId}`);

      await this.reply(
        chatId,
        `&#9989; <b>Berhasil tertaut!</b> Akun Anda (<b>${esc(email)}</b>) akan menerima notifikasi NetFlow di sini.\n\n` +
          `Kirim /unlink kapan saja untuk memutus koneksi.`,
      );
      return;
    }

    // Unknown message — prompt the user
    await this.reply(
      chatId,
      `Kirim /start untuk menghubungkan akun NetFlow Anda, atau /unlink untuk memutus koneksi.`,
    );
  }

  private async reply(chatId: number, html: string): Promise<void> {
    await this.notificationService.sendTelegram(String(chatId), html);
  }
}
