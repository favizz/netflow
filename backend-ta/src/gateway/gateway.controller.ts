import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminJwtGuard } from '../common/guards/admin-jwt.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { assertUnitAccess } from '../common/assert-unit-access';
import { InitiateTopupDto } from '../payments/dto/initiate-topup.dto';
import { PaymentsService } from '../payments/payments.service';
import { GatewayService } from './gateway.service';

@Controller('gateway')
export class GatewayController {
  constructor(
    private readonly gatewayService: GatewayService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('mobile/:unitNo/dashboard')
  @UseGuards(JwtAuthGuard)
  dashboard(@Param('unitNo') unitNo: string, @CurrentUser() user: JwtPayload) {
    assertUnitAccess(user, unitNo);
    return this.gatewayService.getMobileDashboard(unitNo);
  }

  @Get('mobile/:unitNo/trends')
  @UseGuards(JwtAuthGuard)
  trends(
    @Param('unitNo') unitNo: string,
    @Query('period') period: 'daily' | 'monthly' | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    assertUnitAccess(user, unitNo);
    return this.gatewayService.getMobileTrends(unitNo, period || 'daily');
  }

  @Get('tower/connectivity')
  @UseGuards(AdminJwtGuard)
  towerConnectivity(@Query('tower') tower: string | undefined) {
    return this.gatewayService.getTowerConnectivity(tower);
  }

  @Get('mobile/:unitNo/transactions')
  @UseGuards(JwtAuthGuard)
  transactions(
    @Param('unitNo') unitNo: string,
    @CurrentUser() user: JwtPayload,
  ) {
    assertUnitAccess(user, unitNo);
    return this.gatewayService.getTransactions(unitNo);
  }

  @Get('mobile/:unitNo/notifications')
  @UseGuards(JwtAuthGuard)
  notifications(
    @Param('unitNo') unitNo: string,
    @CurrentUser() user: JwtPayload,
  ) {
    assertUnitAccess(user, unitNo);
    return this.gatewayService.getMobileAnomalies(unitNo);
  }

  @Get('mobile/:unitNo/anomalies')
  @UseGuards(JwtAuthGuard)
  anomalies(@Param('unitNo') unitNo: string, @CurrentUser() user: JwtPayload) {
    assertUnitAccess(user, unitNo);
    return this.gatewayService.getMobileAnomalies(unitNo);
  }

  @Get('mobile/:unitNo/invoice/:transactionId')
  @UseGuards(JwtAuthGuard)
  async invoice(
    @Param('unitNo') unitNo: string,
    @Param('transactionId') transactionId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    assertUnitAccess(user, unitNo);
    const invoice = await this.paymentsService.buildInvoiceForUnit(
      unitNo,
      transactionId,
    );
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${transactionId}.txt"`,
    );
    return res.send(invoice);
  }

  @Post('mobile/:unitNo/topup/initiate')
  @UseGuards(JwtAuthGuard)
  initiateTopup(
    @Param('unitNo') unitNo: string,
    @Body() dto: Omit<InitiateTopupDto, 'unitNo'>,
    @CurrentUser() user: JwtPayload,
  ) {
    assertUnitAccess(user, unitNo);
    return this.paymentsService.initiateTopup({ ...dto, unitNo });
  }

  @Get('mobile/:unitNo/topup/status/:transactionId')
  @UseGuards(JwtAuthGuard)
  topupStatus(
    @Param('unitNo') unitNo: string,
    @Param('transactionId') transactionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    assertUnitAccess(user, unitNo);
    return this.paymentsService.getTopupStatus(unitNo, transactionId);
  }

  @Post('mobile/:unitNo/relay')
  @UseGuards(JwtAuthGuard)
  setRelay(
    @Param('unitNo') unitNo: string,
    @Body() body: { status: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    assertUnitAccess(user, unitNo);
    return this.gatewayService.setRelayByUnitNo(
      unitNo,
      Boolean(body.status),
      user.sub,
    );
  }

  @Post('mobile/:unitNo/valve')
  @UseGuards(JwtAuthGuard)
  setValve(
    @Param('unitNo') unitNo: string,
    @Body() body: { status: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    assertUnitAccess(user, unitNo);
    return this.gatewayService.setValveByUnitNo(
      unitNo,
      Boolean(body.status),
      user.sub,
    );
  }
}
