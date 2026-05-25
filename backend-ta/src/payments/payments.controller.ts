import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AdminJwtGuard } from '../common/guards/admin-jwt.guard';
import { InitiateTopupDto } from './dto/initiate-topup.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('topup/initiate')
  @UseGuards(AdminJwtGuard)
  initiate(@Body() dto: InitiateTopupDto) {
    return this.paymentsService.initiateTopup(dto);
  }

  @Post('webhook/callback')
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  )
  callback(@Req() req: Request, @Body() dto: PaymentWebhookDto) {
    this.assertWebhookSource(req);
    return this.paymentsService.handleWebhook(dto);
  }

  @Get('transactions/:unitNo')
  @UseGuards(AdminJwtGuard)
  transactions(@Param('unitNo') unitNo: string) {
    return this.paymentsService.listTransactionsForUnit(unitNo);
  }

  @Get('invoice/:transactionId')
  @UseGuards(AdminJwtGuard)
  async invoice(
    @Param('transactionId') transactionId: string,
    @Res() res: Response,
  ) {
    const invoice = await this.paymentsService.buildInvoice(transactionId);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${transactionId}.txt"`,
    );
    return res.send(invoice);
  }

  private assertWebhookSource(req: Request) {
    const allowed = (
      this.configService.get<string>('PAYMENT_WEBHOOK_ALLOWED_IPS') || ''
    )
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);

    if (allowed.length === 0) {
      this.logger.warn(
        'PAYMENT_WEBHOOK_ALLOWED_IPS is not configured. Webhook endpoint accepts requests from any IP address.',
      );
      return;
    }

    const forwarded = req.headers['x-forwarded-for'];
    const forwardedText = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const firstForwarded = forwardedText?.split(',')[0]?.trim();

    const remoteIp = firstForwarded || req.ip || req.socket.remoteAddress || '';

    const normalized = remoteIp.replace('::ffff:', '');
    const allowedSet = new Set(allowed.map((ip) => ip.replace('::ffff:', '')));

    if (!allowedSet.has(normalized)) {
      throw new UnauthorizedException('Webhook source IP is not allowed');
    }
  }
}
