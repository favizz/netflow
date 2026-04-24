import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Security headers ────────────────────────────────────────────────────────
  app.use(helmet({
    crossOriginEmbedderPolicy: false, // allow WebSocket MQTT from browser
    contentSecurityPolicy: false,     // configured per-environment in Nginx
  }));

  // ── Response compression (gzip) ─────────────────────────────────────────────
  app.use(compression());

  // ── CORS ────────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
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

  // ── Prometheus metrics endpoint ──────────────────────────────────────────────
  // Simple built-in metrics without prom-client dependency.
  // Replace with @willsoto/nestjs-prometheus for production-grade metrics.
  const startTime = Date.now();
  app.getHttpAdapter().get('/metrics', (_req: any, res: any) => {
    const mem = process.memoryUsage();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send([
      `# HELP process_uptime_seconds Process uptime`,
      `# TYPE process_uptime_seconds gauge`,
      `process_uptime_seconds ${((Date.now() - startTime) / 1000).toFixed(1)}`,
      `# HELP process_heap_bytes Node.js heap usage`,
      `# TYPE process_heap_bytes gauge`,
      `process_heap_bytes{type="used"} ${mem.heapUsed}`,
      `process_heap_bytes{type="total"} ${mem.heapTotal}`,
      `process_heap_bytes{type="rss"} ${mem.rss}`,
    ].join('\n'));
  });

  // ── Swagger API docs ─────────────────────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
    const config = new DocumentBuilder()
      .setTitle('NetFlow API')
      .setDescription('Smart Prepaid Metering System — v2 (scale edition)')
      .setVersion('2.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  } catch {
    // @nestjs/swagger not installed — skip
  }

  // ── MQTT microservice ────────────────────────────────────────────────────────
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.MQTT,
    options: {
      url: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
    },
  });

  await app.startAllMicroservices();
  await app.listen(Number(process.env.PORT || 5000));

  console.log(`NetFlow backend listening on :${process.env.PORT || 5000}`);
  console.log(`MQTT connected to ${process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883'}`);
}

void bootstrap();
