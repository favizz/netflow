// src/device/device.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { MeterReading } from './entities/device.entity';
import { Unit } from '../unit/entities/unit.entity';
import { AnomalyModule } from '../anomaly/anomaly.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MeterReading, Unit]),
    ClientsModule.register([
      {
        name: 'MQTT_CLIENT',
        transport: Transport.MQTT,
        options: {
          url: 'mqtt://localhost:1883',
        },
      },
    ]),
    AnomalyModule,
  ],
  controllers: [DeviceController],
  providers: [DeviceService],
})
export class DeviceModule {}