import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
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
  exports: [ClientsModule],
})
export class SharedMqttClientModule {}
