import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryLog } from '../device/entities/telemetry-log.entity';
import { Property } from '../unit/entities/property.entity';
import { Device } from '../device/entities/device.entity';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [TypeOrmModule.forFeature([TelemetryLog, Property, Device])],
  controllers: [ReportingController],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
