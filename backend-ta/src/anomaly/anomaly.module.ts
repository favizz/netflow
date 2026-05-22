import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Anomaly } from './entities/anomaly.entity';
import { UnitModule } from '../unit/unit.module';
import { ResidentsModule } from '../residents/residents.module';
import { AnomalyService } from './anomaly.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    ConfigModule,
    // UnitModule exports UnitService + TypeOrmModule (includes MeterReading repository)
    UnitModule,
    ResidentsModule,
    TypeOrmModule.forFeature([Anomaly]),
    NotificationModule,
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
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AnomalyModule {}
