// src/device/device.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices'; // <--- Import ini
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { MeterReading } from './entities/device.entity';
import { Unit } from '../unit/entities/unit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MeterReading, Unit]),
    
    // Registrasi Client agar bisa PUBLISH ke Broker
    ClientsModule.register([
      {
        name: 'MQTT_CLIENT', // Nama token injeksi (ingat nama ini)
        transport: Transport.MQTT,
        options: {
          url: 'mqtt://localhost:1883', // Sesuaikan URL Broker
        },
      },
    ]),
  ],
  controllers: [DeviceController],
  providers: [DeviceService],
})
export class DeviceModule {}