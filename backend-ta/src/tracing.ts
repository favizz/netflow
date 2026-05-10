/**
 * OpenTelemetry distributed tracing bootstrap.
 *
 * Loaded via "node -r ./dist/src/tracing dist/src/main" in production.
 * Silently skips if OTel packages are not installed (npm install required).
 *
 * Configure via env:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317  → Jaeger / Grafana Tempo
 *   OTEL_SERVICE_NAME=netflow-backend
 *   OTEL_TRACES_EXPORTER=console                        → stdout (dev/test)
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'netflow-backend';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const useConsole = process.env.OTEL_TRACES_EXPORTER === 'console';

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
  const {
    BatchSpanProcessor,
    ConsoleSpanExporter,
  } = require('@opentelemetry/sdk-trace-base');

  let exporter: any;
  if (otlpEndpoint) {
    const {
      OTLPTraceExporter,
    } = require('@opentelemetry/exporter-trace-otlp-grpc');
    exporter = new OTLPTraceExporter({ url: otlpEndpoint });
  } else if (useConsole) {
    exporter = new ConsoleSpanExporter();
  }

  if (exporter) {
    const sdk = new NodeSDK({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: '2.0.0',
      }),
      spanProcessor: new BatchSpanProcessor(exporter),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    });
    sdk.start();
    console.log(
      `[OTel] Tracing active - service="${serviceName}" exporter="${otlpEndpoint ?? 'console'}"`,
    );
    process.on('SIGTERM', () => {
      sdk.shutdown().catch(console.error);
    });
  }
} catch {
  console.warn(
    '[OTel] Packages not installed - tracing disabled. Run: npm install',
  );
}
