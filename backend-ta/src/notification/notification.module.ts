import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ResidentsModule } from '../residents/residents.module';

@Module({
  imports: [ResidentsModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
