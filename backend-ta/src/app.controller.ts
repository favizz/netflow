import { Controller, Get } from '@nestjs/common';
import { HealthService } from './admin/health.service';

@Controller('health')
export class AppController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return { overall: 'ok' };
  }

  @Get('check')
  async getDetailedHealth() {
    return this.healthService.check();
  }
}
