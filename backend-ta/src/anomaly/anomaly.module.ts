import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Anomaly } from './entities/anomaly.entity';
import { MeterReading } from '../device/entities/device.entity';
import { UnitModule } from '../admin/unit/unit.module';
import { ResidentsModule } from '../admin/residents/residents.module';
import { NotificationModule } from '../notification/notification.module';
import { SharedMqttClientModule } from '../common/shared-mqtt-client.module';
import { AnomalyService } from './anomaly.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { AnomalyNotificationService } from './anomaly-notification.service';
import { AnomalyController } from './anomaly.controller';

@Module({
  imports: [
    ConfigModule,
    UnitModule,
    ResidentsModule,
    NotificationModule,
    TypeOrmModule.forFeature([Anomaly, MeterReading]),
    SharedMqttClientModule,
  ],
  controllers: [AnomalyController],
  providers: [
    AnomalyService,
    AnomalyDetectionService,
    AnomalyNotificationService,
  ],
  exports: [AnomalyService],
})
export class AnomalyModule {}
