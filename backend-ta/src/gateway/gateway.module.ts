import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ReportingModule } from '../reporting/reporting.module';
import { UnitModule } from '../admin/unit/unit.module';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { SharedMqttClientModule } from '../common/shared-mqtt-client.module';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { PaymentCompletedListener } from './listeners/payment-completed.listener';

@Module({
  imports: [
    UnitModule,
    ReportingModule,
    PaymentsModule,
    AnomalyModule,
    SharedMqttClientModule,
  ],
  controllers: [GatewayController],
  providers: [
    GatewayService,
    PaymentCompletedListener,
  ],
})
export class GatewayModule {}
