import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { ResidentsModule } from '../residents/residents.module';
import { UnitModule } from '../unit/unit.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PaymentsModule } from '../payments/payments.module';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { TariffModule } from '../tariff/tariff.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AdminJwtGuard } from '../common/guards/admin-jwt.guard';
import { CalibrationSetting } from './entities/calibration-setting.entity';
import { HealthService } from './health.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([CalibrationSetting]),
    ResidentsModule,
    UnitModule,
    PaymentsModule,
    AnomalyModule,
    TariffModule,
    AuditLogModule,
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
  controllers: [AdminController],
  providers: [AdminService, AdminJwtGuard, HealthService],
  exports: [HealthService],
})
export class AdminModule {}
