import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeterReading } from '../device/entities/device.entity';
import { Unit } from './entities/unit.entity';
import { UnitController } from './unit.controller';
import { UnitService } from './unit.service';
import { TariffModule } from '../tariff/tariff.module';
import { ConfigModule } from '@nestjs/config';
import { AdminJwtGuard } from '../common/guards/admin-jwt.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Unit, MeterReading]), TariffModule, ConfigModule],
  controllers: [UnitController],
  providers: [UnitService, AdminJwtGuard],
  exports: [TypeOrmModule, UnitService],
})
export class UnitModule {}
