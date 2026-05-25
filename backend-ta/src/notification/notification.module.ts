import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ResidentsModule } from '../admin/residents/residents.module';
import { UnitModule } from '../admin/unit/unit.module';
import { PaymentCompletedListener } from './listeners/payment-completed.listener';

@Module({
  imports: [ResidentsModule, UnitModule],
  providers: [NotificationService, PaymentCompletedListener],
  exports: [NotificationService],
})
export class NotificationModule {}
