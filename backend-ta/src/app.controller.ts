import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { HealthService } from './admin/health.service';

@Controller('health')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly healthService: HealthService,
  ) {}

  @Get()
  getHealth() {
    return { overall: 'ok' };
  }

  @Get('check')
  async getDetailedHealth() {
    return this.healthService.check();
  }
}
