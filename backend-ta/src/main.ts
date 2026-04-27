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
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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
  app.enableCors({
    origin: process.env.CORS_ORIGIN!.split(','),
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

  // ── Health check + Prometheus metrics ───────────────────────────────────────
  const startTime = Date.now();

  // Capture DataSource once at bootstrap — app.get() inside an Express handler
  // runs outside the NestJS resolution context and throws UnknownElementException.
  let dataSource: DataSource | null = null;
  try { dataSource = app.get(DataSource); } catch { /* DB unavailable at boot */ }

  // GET /health — checks all downstream dependencies, returns 200 OK or 503
  app.getHttpAdapter().get('/health', async (_req: Request, res: Response) => {
    const checks: Record<string, { ok: boolean; latencyMs?: number }> = {};

    await Promise.all([
      // Database (MySQL)
      (async () => {
        if (!dataSource) { checks.database = { ok: false }; return; }
        try {
          const t0 = Date.now();
          await dataSource.query('SELECT 1');
          checks.database = { ok: true, latencyMs: Date.now() - t0 };
        } catch {
          checks.database = { ok: false };
        }
      })(),

      // Redis
      (async () => {
        try {
          const t0 = Date.now();
          const r = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT || 6379),
            password: process.env.REDIS_PASSWORD || undefined,
            connectTimeout: 2000,
            lazyConnect: true,
          });
          await r.connect();
          await r.ping();
          await r.quit();
          checks.redis = { ok: true, latencyMs: Date.now() - t0 };
        } catch {
          checks.redis = { ok: false };
        }
      })(),

      // MQTT broker (TCP reachability)
      new Promise<void>((resolve) => {
        const mqttUrl = process.env.MQTT_BROKER_URL ?? '';
        const match = mqttUrl.match(/^mqtts?:\/\/([^/:]+):?(\d+)?/);
        const host = match?.[1] ?? 'localhost';
        const port = parseInt(match?.[2] ?? '1883', 10);
        const t0 = Date.now();
        const sock = net.createConnection({ host, port }, () => {
          sock.destroy();
          checks.mqtt = { ok: true, latencyMs: Date.now() - t0 };
          resolve();
        });
        sock.setTimeout(2000);
        sock.on('timeout', () => { sock.destroy(); checks.mqtt = { ok: false }; resolve(); });
        sock.on('error', () => { checks.mqtt = { ok: false }; resolve(); });
      }),

      // ML service
      (async () => {
        try {
          const t0 = Date.now();
          const resp = await fetch(`${process.env.ML_SERVICE_URL}/health`);
          checks.ml = { ok: resp.ok, latencyMs: Date.now() - t0 };
        } catch {
          checks.ml = { ok: false };
        }
      })(),

      // SMTP (config-only check — no connection attempt needed)
      (() => {
        const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
        checks.smtp = { ok: configured };
      })(),
    ]);

    const critical = !checks.database?.ok || !checks.mqtt?.ok;
    const degraded = !checks.redis?.ok || !checks.ml?.ok;
    const overall = critical ? 'critical' : degraded ? 'degraded' : 'healthy';

    res.status(overall === 'healthy' ? 200 : 503).json({
      overall,
      uptime_s:  ((Date.now() - startTime) / 1000).toFixed(1),
      checks,
      checkedAt: new Date().toISOString(),
    });
  });

  // GET /metrics — Prometheus-compatible process metrics
  app.getHttpAdapter().get('/metrics', (_req: Request, res: Response) => {
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
  const swaggerConfig = new DocumentBuilder()
    .setTitle('NetFlow API')
    .setDescription('Smart Prepaid Metering System — v2 (scale edition)')
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

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
