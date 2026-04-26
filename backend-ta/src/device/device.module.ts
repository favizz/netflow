import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';

import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { TelemetryProcessor, TELEMETRY_QUEUE } from './telemetry.processor';
import { MeterReading } from './entities/device.entity';
import { Unit } from '../unit/entities/unit.entity';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { TariffModule } from '../tariff/tariff.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MeterReading, Unit]),
    ConfigModule,
    TariffModule,
    AnomalyModule,

    // Telemetry ingestion queue backed by Redis
    BullModule.registerQueue({ name: TELEMETRY_QUEUE }),

    // MQTT client for emitting relay/valve commands
    ClientsModule.registerAsync([
      {
        name: 'MQTT_CLIENT',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.MQTT,
          options: {
            url: configService.get<string>('MQTT_BROKER_URL'),
            username: configService.get<string>('MQTT_USERNAME') || undefined,
            password: configService.get<string>('MQTT_PASSWORD') || undefined,
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
  ],
  controllers: [DeviceController],
  providers: [DeviceService, TelemetryProcessor],
  exports: [DeviceService],
})
export class DeviceModule {}
