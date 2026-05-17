import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ResidentsService } from '../residents/residents.service';
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
  async handleWebhook(@Body() update: TelegramUpdate): Promise<void> {
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
        `👋 Hi ${firstName}! I'm the NetFlow notification bot.\n\n` +
          `Please reply with your *registered email address* to link this Telegram account and start receiving alerts.`,
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
          '✅ Your Telegram account has been unlinked from NetFlow.',
        );
      } else {
        await this.reply(
          chatId,
          'No NetFlow account is linked to this Telegram.',
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
          "❌ That doesn't look like a valid email. Please try again.",
        );
        return;
      }

      const resident = await this.residentsService.findByEmail(email);
      if (!resident) {
        await this.reply(
          chatId,
          `❌ No account found for *${email}*.\n\nMake sure it matches the email registered by your building admin.`,
        );
        return;
      }

      this.pending.delete(chatId);
      await this.residentsService.setTelegramChatId(email, String(chatId));
      this.logger.log(`Telegram linked: ${email} → chatId ${chatId}`);

      await this.reply(
        chatId,
        `✅ *Linked!* Your account (${email}) will now receive NetFlow alerts here.\n\n` +
          `Send /unlink at any time to disconnect.`,
      );
      return;
    }

    // Unknown message — prompt the user
    await this.reply(
      chatId,
      `Send /start to link your NetFlow account, or /unlink to disconnect.`,
    );
  }

  private async reply(chatId: number, text: string): Promise<void> {
    await this.notificationService.sendTelegram(String(chatId), text);
  }
}
