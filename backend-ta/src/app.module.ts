import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { AnomalyModule } from './anomaly/anomaly.module';
import { DeviceModule } from './device/device.module';
import { GatewayModule } from './gateway/gateway.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportingModule } from './reporting/reporting.module';
import { UnitModule } from './unit/unit.module';
import { AuthModule } from './auth/auth.module';
import { TariffModule } from './tariff/tariff.module';
import { AuditLogModule } from './audit-log/audit-log.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env' }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      username: process.env.DB_USER || 'admin',
      password: process.env.DB_PASS || 'public',
      database: process.env.DB_NAME || 'iot_system',
      autoLoadEntities: true,
      synchronize: false,
    }),
    UnitModule,
    DeviceModule,
    ReportingModule,
    PaymentsModule,
    GatewayModule,
    AnomalyModule,
    AdminModule,
    AuthModule,
    TariffModule,
    AuditLogModule,
  ],
})
export class AppModule {}

