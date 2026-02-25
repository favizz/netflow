// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Koneksi ke MQTT Broker
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.MQTT,
    options: {
      url: 'mqtt://localhost:1883', // Port Broker Docker
    },
  });

  // 2. Jalankan Microservice & HTTP Server
  await app.startAllMicroservices();
  await app.listen(3000);
  console.log('🚀 Backend IoT siap menerima data!');
}
bootstrap();