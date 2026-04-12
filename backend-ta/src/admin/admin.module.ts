import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResidentsModule } from '../residents/residents.module';
import { UnitModule } from '../unit/unit.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PaymentsModule } from '../payments/payments.module';
import { AnomalyModule } from '../anomaly/anomaly.module';

@Module({
  imports: [ConfigModule, ResidentsModule, UnitModule, PaymentsModule, AnomalyModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
