import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Anomaly } from './entities/anomaly.entity';
import { MeterReading } from '../device/entities/device.entity';
import { UnitModule } from '../admin/unit/unit.module';
import { ResidentsModule } from '../admin/residents/residents.module';
import { NotificationModule } from '../notification/notification.module';
import { AnomalyService } from './anomaly.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { AnomalyNotificationService } from './anomaly-notification.service';
import { AnomalyController } from './anomaly.controller';

@Module({
  imports: [
    ConfigModule,
    UnitModule,
    ResidentsModule,
    NotificationModule,
    TypeOrmModule.forFeature([Anomaly, MeterReading]),
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
            rejectUnauthorized: false,
            serializer: {
              serialize: (value: { data: unknown }): Buffer => {
                const payload = value.data;
                if (Buffer.isBuffer(payload)) return payload;
                if (payload instanceof Uint8Array) return Buffer.from(payload);
                return Buffer.from(JSON.stringify(payload));
              },
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [AnomalyController],
  providers: [AnomalyService, AnomalyDetectionService, AnomalyNotificationService],
  exports: [AnomalyService],
})
export class AnomalyModule {}
