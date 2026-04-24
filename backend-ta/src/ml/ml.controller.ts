import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../common/guards/admin-jwt.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MlService } from './ml.service';

@Controller()
export class MlController {
  constructor(private readonly mlService: MlService) {}

  // ── Admin: anomaly scores for all units ───────────────────────────────────

  @UseGuards(AdminJwtGuard)
  @Get('admin/ml/scores')
  async getAllScores() {
    return this.mlService.getAllScores();
  }

  @UseGuards(AdminJwtGuard)
  @Post('admin/ml/score-all')
  async triggerScoring() {
    await this.mlService.scoreAllUnits();
    return { triggered: true };
  }

  // ── Resident: balance depletion forecast ──────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('gateway/mobile/:unitNo/forecast')
  async forecast(@Param('unitNo') unitNo: string) {
    return this.mlService.getDepletionForecast(unitNo);
  }
}
