import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { TelemetryProcessor, TELEMETRY_QUEUE } from './telemetry.processor';
import { MeterReading } from './entities/device.entity';
import { Unit } from '../admin/unit/entities/unit.entity';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { AuditLogModule } from '../admin/audit-log/audit-log.module';
import { SharedMqttClientModule } from '../common/shared-mqtt-client.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MeterReading, Unit]),
    ConfigModule,
    AnomalyModule,
    AuditLogModule,
    PaymentsModule,
    BullModule.registerQueue({ name: TELEMETRY_QUEUE }),
    SharedMqttClientModule,
  ],
  controllers: [DeviceController],
  providers: [DeviceService, TelemetryProcessor],
  exports: [DeviceService],
})
export class DeviceModule {}
