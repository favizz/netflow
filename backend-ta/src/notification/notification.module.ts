import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ResidentsModule } from '../residents/residents.module';
import { UnitModule } from '../unit/unit.module';
import { PaymentCompletedListener } from './listeners/payment-completed.listener';

  @Module({
    imports: [ResidentsModule, UnitModule],
    providers: [NotificationService, PaymentCompletedListener],
    exports: [NotificationService],
  })
  export class NotificationModule {}