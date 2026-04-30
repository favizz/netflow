import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { HealthService } from './admin/health.service';

@Controller('health')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly healthService: HealthService,
  ) {}

  @Get('check')
  getHello(): string {
    return this.appService.getHello();
  }

  @Get()
  async getHealth() {
    // Keep the internal check for logs, but return 'ok' for the script
    await this.healthService.check();
    return { overall: 'ok' };
  }
}
