import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import compression from 'compression';
import helmet from 'helmet';
import Redis from 'ioredis';
import * as net from 'net';
import type { Request, Response } from 'express';

// Suppress raw ioredis reconnect noise — BullMQ inline fallback handles these
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') return;
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason: unknown) => {
  const code = (reason as NodeJS.ErrnoException)?.code;
  if (code === 'ECONNRESET' || code === 'ECONNREFUSED') return;
  if (reason instanceof AggregateError) return;
  console.error('[FATAL] Unhandled rejection:', reason);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Security headers ────────────────────────────────────────────────────────
  app.use(helmet({
    crossOriginEmbedderPolicy: false,                          // allow WebSocket MQTT from browser
    contentSecurityPolicy: false,                              // configured per-environment in Nginx
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // allow Google OAuth popup postMessage
  }));

  // ── Response compression (gzip) ─────────────────────────────────────────────
  app.use(compression());

  // ── CORS ────────────────────────────────────────────────────────────────────
  const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['*'];
  console.log(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);
  
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // ── Input validation ─────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // ── Swagger API docs (optional — install @nestjs/swagger to enable) ─────────
  try {
    /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
    const swaggerConfig = new DocumentBuilder()
      .setTitle('NetFlow API')
      .setDescription('Smart Prepaid Metering System — v2 (scale edition)')
      .setVersion('2.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
    /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  } catch { /* @nestjs/swagger not installed — API docs disabled */ }

  // ── MQTT microservice ────────────────────────────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.MQTT,
    options: {
      url: process.env.MQTT_BROKER_URL,
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
    },
  });

  await app.startAllMicroservices();
  await app.listen(Number(process.env.PORT || 5000));

  console.log(`NetFlow backend listening on :${process.env.PORT || 5000}`);
  console.log(`MQTT connected to ${process.env.MQTT_BROKER_URL}`);
}

void bootstrap();
