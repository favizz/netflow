import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Anomaly } from './entities/anomaly.entity';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { UnitModule } from '../unit/unit.module';
import { AnomalyService } from './anomaly.service';

@Module({
  imports: [
    // UnitModule exports UnitService + TypeOrmModule (includes MeterReading repository)
    UnitModule,
    TypeOrmModule.forFeature([Anomaly]),
    ClientsModule.registerAsync([
      {
        name: 'MQTT_CLIENT',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.MQTT,
          options: {
            url: configService.get<string>('MQTT_BROKER_URL') || 'mqtt://localhost:1883',
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
