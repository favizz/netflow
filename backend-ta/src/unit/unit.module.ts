// src/unit/unit.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'; // <--- Import ini
import { UnitService } from './unit.service';
import { UnitController } from './unit.controller';
import { Unit } from './entities/unit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Unit])], // <--- Daftarkan Entity di sini
  controllers: [UnitController],
  providers: [UnitService],
  exports: [TypeOrmModule] // <--- EKSPOR agar DeviceModule bisa pakai Repository<Unit>
})
export class UnitModule {}