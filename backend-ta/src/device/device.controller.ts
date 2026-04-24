import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, MqttContext } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DeviceService } from './device.service';
import { TELEMETRY_QUEUE } from './telemetry.processor';

/**
 * MQTT ingestion controller.
 *
 * Receives binary telemetry frames and immediately pushes them to the BullMQ
 * Redis queue so the MQTT handler returns in < 1 ms.  The TelemetryProcessor
 * worker pool handles the DB transaction asynchronously.
 *
 * Fallback: if Redis is unavailable (queue.add throws), the payload is
 * processed inline — behaviour identical to the v1 implementation.
 */
@Controller('device')
export class DeviceController {
  private readonly logger = new Logger(DeviceController.name);

  constructor(
    @InjectQueue(TELEMETRY_QUEUE) private readonly telemetryQueue: Queue,
    private readonly deviceService: DeviceService,
  ) {}

  @MessagePattern('device/+/data')
  async handleSensorData(@Payload() data: any, @Ctx() ctx: MqttContext) {
    const topic: string = ctx.getTopic();
    const deviceId = topic.split('/')[1] ?? null;

    // Merge device_id so downstream code does not need to parse the topic.
    let payload: Record<string, unknown>;
    if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      // Serialize buffer as base64 so BullMQ can store it in Redis JSON.
      payload = { _isBuffer: true, _data: buf.toString('base64'), _deviceId: deviceId };
    } else {
      payload = { ...(data as Record<string, unknown>), _deviceId: deviceId };
    }

    try {
      await this.telemetryQueue.add('process', payload, {
        removeOnComplete: 2_000,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
      });
    } catch (queueErr) {
      // Redis unavailable — fall back to inline processing (same as v1).
      this.logger.warn(`Queue unavailable, processing inline: ${(queueErr as Error).message}`);
      try {
        await this.deviceService.saveSensorData(payload);
      } catch (err) {
        this.logger.error(`Inline telemetry error for ${deviceId}: ${(err as Error).message}`);
      }
    }
  }
}
