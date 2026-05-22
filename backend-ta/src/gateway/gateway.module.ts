import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { PaymentsModule } from '../payments/payments.module';
import { ReportingModule } from '../reporting/reporting.module';
import { UnitModule } from '../unit/unit.module';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { PaymentCompletedListener } from './listeners/payment-completed.listener';

@Module({
  imports: [
    UnitModule,
    ReportingModule,
    PaymentsModule,
    AnomalyModule,
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
            // If the caller already encoded a Buffer (custom binary frame),
            // pass it through unchanged; otherwise fall back to JSON.
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
  controllers: [GatewayController],
  providers: [GatewayService, PaymentCompletedListener],
})
export class GatewayModule {}
