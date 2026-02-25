import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ReportingModule } from '../reporting/reporting.module';
import { UnitModule } from '../unit/unit.module';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

@Module({
  imports: [UnitModule, ReportingModule, PaymentsModule],
  controllers: [GatewayController],
  providers: [GatewayService],
})
export class GatewayModule {}
