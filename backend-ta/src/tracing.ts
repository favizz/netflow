/**
 * OpenTelemetry distributed tracing bootstrap.
 *
 * This is imported by main.ts and preloaded by production scripts so
 * instrumentations register before the application dependencies are evaluated.
 *
 * Configure via env:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 *   OTEL_SERVICE_NAME=netflow-backend
 *   OTEL_TRACES_EXPORTER=console
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnvFile } from 'dotenv';

loadTracingEnv();

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'netflow-backend';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const useConsole = process.env.OTEL_TRACES_EXPORTER === 'console';
const tracingDisabled = process.env.OTEL_TRACES_EXPORTER === 'none';
const otlpProtocol =
  process.env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL ??
  process.env.OTEL_EXPORTER_OTLP_PROTOCOL ??
  'http/protobuf';

try {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { Resource } = require('@opentelemetry/resources');
  const {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
  } = require('@opentelemetry/semantic-conventions');
  const {
    getNodeAutoInstrumentations,
  } = require('@opentelemetry/auto-instrumentations-node');
  const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');

  if (!tracingDisabled && (otlpEndpoint || useConsole)) {
    const sdk = new NodeSDK({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: '2.0.0',
      }),
      // OTLP stays environment-driven so protocol and auth headers are honored.
      ...(useConsole ? { traceExporter: new ConsoleSpanExporter() } : {}),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    });

    sdk.start();
    console.log(
      `[OTel] Tracing active - service="${serviceName}" exporter="${otlpEndpoint ?? 'console'}" protocol="${otlpProtocol}"`,
    );

    const shutdown = () => {
      void sdk.shutdown().catch(console.error);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
} catch (error) {
  console.warn(`[OTel] Tracing bootstrap failed: ${(error as Error).message}`);
}

function loadTracingEnv() {
  // Nest loads these later via ConfigModule. Tracing runs first so it needs
  // exporter protocol and auth settings before the SDK is constructed.
  const rootEnv = resolve(process.cwd(), '../.env');
  const rootDevEnv = resolve(process.cwd(), '../.env.dev');
  const envFiles =
    process.env.NODE_ENV === 'production' ? [rootEnv] : [rootDevEnv, rootEnv];

  for (const envFile of envFiles) {
    if (existsSync(envFile)) {
      loadEnvFile({ path: envFile });
    }
  }
}
