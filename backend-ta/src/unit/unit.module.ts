import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeterReading } from '../device/entities/device.entity';
import { Unit } from './entities/unit.entity';
import { UnitController } from './unit.controller';
import { UnitService } from './unit.service';

@Module({
  imports: [TypeOrmModule.forFeature([Unit, MeterReading])],
  controllers: [UnitController],
  providers: [UnitService],
  exports: [TypeOrmModule, UnitService],
})
export class UnitModule {}
