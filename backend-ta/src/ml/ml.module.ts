import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        baseURL: cfg.get('ML_SERVICE_URL', 'http://localhost:8000'),
        timeout: 8_000,
      }),
      inject: [ConfigService],
    }),
    UnitModule,
    TariffModule,
  ],
  providers: [MlService],
  controllers: [MlController],
  exports: [MlService],
})
export class MlModule {}
