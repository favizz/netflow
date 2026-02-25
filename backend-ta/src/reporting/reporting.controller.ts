import { Controller, Get, Param, Query } from '@nestjs/common';
import { TrendQueryDto } from './dto/trend-query.dto';
import { ReportingService } from './reporting.service';

@Controller('reporting')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('trends/:unitNo')
  getTrends(@Param('unitNo') unitNo: string, @Query() query: TrendQueryDto) {
    return this.reportingService.getConsumptionTrends(unitNo, query.period || 'daily');
  }
}
