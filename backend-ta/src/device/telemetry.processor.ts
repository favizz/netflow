import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job } from 'bullmq';
import { decodeTelemetry } from '../common/binary-codec';
import { DeviceService } from './device.service';

export const TELEMETRY_QUEUE = 'telemetry';

/**
 * BullMQ processor for asynchronous telemetry ingestion.
 *
 * The MQTT handler pushes raw payloads to Redis immediately (μs latency),
 * then this processor handles the expensive DB transaction in the background.
 * At 10 000 devices × 1 message/5 s = 2 000 messages/s, Redis absorbs the
 * burst and the pool of workers processes at a sustained DB-safe rate.
 *
 * Concurrency is controlled by TELEMETRY_QUEUE_CONCURRENCY in .env.
 */
@Processor(TELEMETRY_QUEUE, {
  concurrency: Number(process.env.TELEMETRY_QUEUE_CONCURRENCY || 50),
})
export class TelemetryProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(TelemetryProcessor.name);

  constructor(private readonly deviceService: DeviceService) {
    super();
  }

  // Runs after all onModuleInit hooks — worker is guaranteed to exist here.
  onApplicationBootstrap() {
    // Absorb Worker-level Redis errors so they don't crash the process.
    // When Redis is unavailable, DeviceController falls back to inline processing.
    this.worker?.on('error', (err: Error) => {
      this.logger.warn(
        `BullMQ worker error (Redis unavailable, inline fallback active): ${err.message}`,
      );
    });
  }

  async process(job: Job): Promise<void> {
    try {
      // Binary payloads were base64-encoded before queuing to survive JSON serialization.
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      const payload = job.data;
      if (payload?._isBuffer && typeof payload._data === 'string') {
        const buf = Buffer.from(payload._data as string, 'base64');
        if (buf.length !== 21 && buf.length !== 25) {
          this.logger.warn(
            `Telemetry job ${job.id} ignored invalid binary length: ${buf.length}`,
          );
          return;
        }
        const deviceId = payload._deviceId as string;
        await this.deviceService.saveSensorData({
          ...decodeBinaryPayload(buf),
          _deviceId: deviceId,
        });
      } else {
        await this.deviceService.saveSensorData(payload);
      }
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    } catch (err) {
      this.logger.error(
        `Telemetry job ${job.id} failed: ${(err as Error).message}`,
      );
      throw err; // BullMQ retries on throw
    }
  }
}

function decodeBinaryPayload(buf: Buffer): Record<string, unknown> {
  return decodeTelemetry(buf) as unknown as Record<string, unknown>;
}
