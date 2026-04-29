import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MlService } from './ml.service';
import { MlController } from './ml.controller';
import { MeterReading } from '../device/entities/device.entity';
import { Unit } from '../unit/entities/unit.entity';
import { UnitModule } from '../unit/unit.module';
import { TariffModule } from '../tariff/tariff.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([MeterReading, Unit]),
    UnitModule,
    TariffModule,
  ],
  providers: [MlService],
  controllers: [MlController],
  exports: [MlService],
})
export class MlModule {}
