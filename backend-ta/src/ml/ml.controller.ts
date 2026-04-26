import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../common/guards/admin-jwt.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MlService } from './ml.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Param } from '@nestjs/common';
import { assertUnitAccess } from '../common/assert-unit-access';

@Controller()
export class MlController {
  constructor(private readonly mlService: MlService) {}

  // ── Admin: anomaly scores ─────────────────────────────────────────────────

  @UseGuards(AdminJwtGuard)
  @Get('admin/ml/scores')
  getAllScores() {
    return this.mlService.getAllScores();
  }

  @UseGuards(AdminJwtGuard)
  @Post('admin/ml/score-all')
  async triggerScoring() {
    await this.mlService.scoreAllUnits();
    return { triggered: true };
  }

  // ── Admin: model management ───────────────────────────────────────────────

  @UseGuards(AdminJwtGuard)
  @Get('admin/ml/model-info')
  async getModelInfo() {
    const info = await this.mlService.getModelInfo();
    if (!info) return { error: 'ML service unavailable' };
    return info;
  }

  @UseGuards(AdminJwtGuard)
  @Post('admin/ml/train')
  async triggerRetraining() {
    const result = await this.mlService.retrainWithFieldData();
    return result;
  }

  // ── Resident: balance depletion forecast ──────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('gateway/mobile/:unitNo/forecast')
  async forecast(
    @Param('unitNo') unitNo: string,
    @CurrentUser() user: JwtPayload,
  ) {
    assertUnitAccess(user, unitNo);
    return this.mlService.getDepletionForecast(unitNo);
  }
}
