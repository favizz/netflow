import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { HealthService } from './admin/health.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly healthService: HealthService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return this.healthService.check();
  }
}
