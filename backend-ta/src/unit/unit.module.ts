import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeterReading } from '../device/entities/device.entity';
import { Unit } from './entities/unit.entity';
import { UnitController } from './unit.controller';
import { UnitService } from './unit.service';
import { TariffModule } from '../tariff/tariff.module';
import { ConfigModule } from '@nestjs/config';
import { AdminJwtGuard } from '../common/guards/admin-jwt.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Unit, MeterReading]),
    TariffModule,
    ConfigModule,
    AuditLogModule,
  ],
  controllers: [UnitController],
  providers: [UnitService, AdminJwtGuard],
  exports: [TypeOrmModule, UnitService],
})
export class UnitModule {}
