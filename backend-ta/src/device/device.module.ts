import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { MeterReading } from './entities/device.entity';
import { Unit } from '../unit/entities/unit.entity';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { TariffModule } from '../tariff/tariff.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MeterReading, Unit]),
    ConfigModule,
    TariffModule,
    ClientsModule.registerAsync([
      {
        name: 'MQTT_CLIENT',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.MQTT,
          options: {
            url: configService.get<string>('MQTT_BROKER_URL') || 'mqtt://localhost:1883',
            // Pass pre-encoded Buffers through unchanged; fall back to JSON otherwise.
            serializer: {
              serialize: (value: { data: unknown }): Buffer => {
                const d = value.data;
                if (Buffer.isBuffer(d)) return d;
                if (d instanceof Uint8Array) return Buffer.from(d);
                return Buffer.from(JSON.stringify(d));
              },
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
    AnomalyModule,
  ],
  controllers: [DeviceController],
  providers: [DeviceService],
})
export class DeviceModule {}
