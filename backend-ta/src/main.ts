import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import compression from 'compression';
import helmet from 'helmet';

// Suppress raw ioredis reconnect noise - BullMQ inline fallback handles these
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

  app.setGlobalPrefix('api');

  // ── Security headers ────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false, // allow WebSocket MQTT from browser
      contentSecurityPolicy: false, // configured per-environment in Nginx
      crossOriginOpenerPolicy: { policy: 'unsafe-none' }, // allow postMessage for OAuth/Popups
    }),
  );

  // ── Response compression (gzip) ─────────────────────────────────────────────
  app.use(compression());

  // ── CORS ────────────────────────────────────────────────────────────────────
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['*'];
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

  // ── Swagger API docs (optional - install @nestjs/swagger to enable) ─────────
  try {
    /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
    const swaggerConfig = new DocumentBuilder()
      .setTitle('NetFlow API')
      .setDescription('Smart Prepaid Metering System - v2 (scale edition)')
      .setVersion('2.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
    /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  } catch {
    /* @nestjs/swagger not installed - API docs disabled */
  }

  // ── MQTT microservice ────────────────────────────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.MQTT,
    options: {
      url: process.env.MQTT_BROKER_URL,
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
    },
  });

  const port = Number(process.env.PORT || 5000);
  await app.listen(port, '0.0.0.0');

  await app.startAllMicroservices();

  console.log(`NetFlow backend listening on 0.0.0.0:${port}`);
  console.log(`MQTT connected to ${process.env.MQTT_BROKER_URL}`);
}

void bootstrap();
