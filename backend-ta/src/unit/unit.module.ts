import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from './entities/property.entity';
import { Device } from '../device/entities/device.entity';
import { CurrentBalance } from '../device/entities/current-balance.entity';
import { TelemetryLog } from '../device/entities/telemetry-log.entity';
import { UtilityTariff } from '../payments/entities/utility-tariff.entity';
import { UnitController } from './unit.controller';
import { UnitService } from './unit.service';

@Module({
  imports: [TypeOrmModule.forFeature([Property, Device, CurrentBalance, TelemetryLog, UtilityTariff])],
  controllers: [UnitController],
  providers: [UnitService],
  exports: [TypeOrmModule, UnitService],
})
export class UnitModule {}
