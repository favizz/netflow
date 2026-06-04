import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';

import { ScheduleModule } from '@nestjs/schedule';

import { AdminModule } from './admin/admin.module';
import { AnomalyModule } from './anomaly/anomaly.module';
import { DeviceModule } from './device/device.module';
import { GatewayModule } from './gateway/gateway.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportingModule } from './reporting/reporting.module';
import { UnitModule } from './admin/unit/unit.module';
import { AuthModule } from './auth/auth.module';
import { TariffModule } from './admin/tariff/tariff.module';
import { AuditLogModule } from './admin/audit-log/audit-log.module';
import { RetentionModule } from './admin/retention/retention.module';
import { TelegramModule } from './telegram/telegram.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    // ── Config ───────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '../.env'
          : ['../.env.dev', '../.env'],
    }),

    ScheduleModule.forRoot(),

    EventEmitterModule.forRoot(),
    // ── Database ─────────────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        type: 'mysql',
        host: cfg.get('DB_HOST', 'localhost'),
        port: cfg.get<number>('DB_PORT', 3306),
        username: cfg.get('DB_USER', 'root'),
        password: cfg.get('DB_PASS', ''),
        database: cfg.get('DB_NAME', 'srusun-ta252601002'),
        autoLoadEntities: true,
        synchronize: false,
        // Connection pool tuned for 10 k+ concurrent units
        extra: {
          connectionLimit: cfg.get<number>('DB_POOL_SIZE', 20),
          idleTimeout: cfg.get<number>('DB_POOL_IDLE_TIMEOUT', 30_000),
          enableKeepAlive: true,
          keepAliveInitialDelay: 10_000,
        },
      }),
      inject: [ConfigService],
    }),

    // ── Redis / BullMQ ────────────────────────────────────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        connection: {
          host: cfg.get('REDIS_HOST', 'localhost'),
          port: cfg.get<number>('REDIS_PORT', 6379),
          password: cfg.get('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: null, // required for BullMQ
          retryStrategy: (times: number) =>
            times > 3 ? null : Math.min(times * 500, 2000),
        },
      }),
      inject: [ConfigService],
    }),

    // ── Rate limiting (per-IP) ────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        throttlers: [
          {
            ttl: cfg.get<number>('THROTTLE_TTL', 60_000),
            limit: cfg.get<number>('THROTTLE_LIMIT', 120),
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // ── Domain modules ────────────────────────────────────────────────────────
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
    RetentionModule,
    TelegramModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
