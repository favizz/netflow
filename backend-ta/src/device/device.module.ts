import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { Device } from './entities/device.entity';
import { Property } from '../unit/entities/property.entity';
import { CurrentBalance } from './entities/current-balance.entity';
import { TelemetryLog } from './entities/telemetry-log.entity';
import { UtilityTariff } from '../payments/entities/utility-tariff.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, Property, CurrentBalance, TelemetryLog, UtilityTariff]),
    ClientsModule.register([
      {
        name: 'MQTT_CLIENT',
        transport: Transport.MQTT,
        options: {
          url: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
        },
      },
    ]),
  ],
  controllers: [DeviceController],
  providers: [DeviceService],
  exports: [DeviceService, TypeOrmModule],
})
export class DeviceModule {}