import { Controller, Logger } from '@nestjs/common';
import {
  MessagePattern,
  Payload,
  Ctx,
  MqttContext,
} from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DeviceService } from './device.service';
import { TELEMETRY_QUEUE } from './telemetry.processor';
import { AuditLogService } from '../audit-log/audit-log.service';

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
    private readonly auditLogService: AuditLogService,
  ) {}

  @MessagePattern('device/+/ota_ack')
  handleOtaAck(@Payload() data: unknown, @Ctx() ctx: MqttContext): void {
    const topic = ctx.getTopic();
    const deviceId = topic.split('/')[1] ?? 'unknown';

    let ack: { status?: string; version?: string; error?: number } = {};
    try {
      const raw = Buffer.isBuffer(data)
        ? data.toString('utf8')
        : JSON.stringify(data);
      ack = JSON.parse(raw) as typeof ack;
    } catch {
      ack = { status: 'unknown' };
    }

    const result =
      ack.status === 'ok'
        ? 'success'
        : ack.status === 'noop'
          ? 'info'
          : 'failure';
    this.logger.log(`OTA ACK [${deviceId}] → ${JSON.stringify(ack)}`);
    void this.auditLogService.log(
      `device:${deviceId}`,
      'OTA_ACK',
      'device',
      deviceId,
      ack as Record<string, unknown>,
      result,
    );
  }

  @MessagePattern('device/+/config_ack')
  handleCalibrationAck(
    @Payload() data: unknown,
    @Ctx() ctx: MqttContext,
  ): void {
    const topic = ctx.getTopic();
    const deviceId = topic.split('/')[1] ?? 'unknown';

    let ack: { status?: string; error?: string | number } = {};
    try {
      const raw = Buffer.isBuffer(data)
        ? data.toString('utf8')
        : JSON.stringify(data);
      ack = JSON.parse(raw) as typeof ack;
    } catch {
      ack = { status: 'unknown' };
    }

    const result = ack.status === 'ok' ? 'success' : 'failure';
    this.logger.log(`CONFIG ACK [${deviceId}] → ${JSON.stringify(ack)}`);
    void this.auditLogService.log(
      `device:${deviceId}`,
      'CONFIG_ACK',
      'device',
      deviceId,
      ack as Record<string, unknown>,
      result,
    );
  }

  @MessagePattern('device/+/command_ack')
  handleCommandAck(@Payload() data: unknown, @Ctx() ctx: MqttContext): void {
    const topic = ctx.getTopic();
    const deviceId = topic.split('/')[1] ?? 'unknown';

    let ack: { status?: string; type?: string; error?: string | number } = {};
    try {
      const raw = Buffer.isBuffer(data)
        ? data.toString('utf8')
        : JSON.stringify(data);
      ack = JSON.parse(raw) as typeof ack;
    } catch {
      ack = { status: 'unknown' };
    }

    const result = ack.status === 'ok' ? 'success' : 'failure';
    this.logger.log(`COMMAND ACK [${deviceId}] → ${JSON.stringify(ack)}`);
    void this.auditLogService.log(
      `device:${deviceId}`,
      'COMMAND_ACK',
      'device',
      deviceId,
      ack as Record<string, unknown>,
      result,
    );
  }

  @MessagePattern('device/+/topup_ack')
  handleTopupAck(@Payload() data: unknown, @Ctx() ctx: MqttContext): void {
    const topic = ctx.getTopic();
    const deviceId = topic.split('/')[1] ?? 'unknown';

    let ack: { status?: string; amount?: number; error?: string | number } = {};
    try {
      const raw = Buffer.isBuffer(data)
        ? data.toString('utf8')
        : JSON.stringify(data);
      ack = JSON.parse(raw) as typeof ack;
    } catch {
      ack = { status: 'unknown' };
    }

    const result = ack.status === 'ok' ? 'success' : 'failure';
    this.logger.log(`TOPUP ACK [${deviceId}] → ${JSON.stringify(ack)}`);
    void this.auditLogService.log(
      `device:${deviceId}`,
      'TOPUP_ACK',
      'device',
      deviceId,
      ack as Record<string, unknown>,
      result,
    );
  }

  @MessagePattern('device/+/data')
  async handleSensorData(@Payload() data: any, @Ctx() ctx: MqttContext) {
    const topic: string = ctx.getTopic();
    const deviceId = topic.split('/')[1] ?? null;

    // Merge device_id so downstream code does not need to parse the topic.
    let payload: Record<string, unknown>;
    if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      // Serialize buffer as base64 so BullMQ can store it in Redis JSON.
      payload = {
        _isBuffer: true,
        _data: buf.toString('base64'),
        _deviceId: deviceId,
      };
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
      this.logger.warn(
        `Queue unavailable, processing inline: ${(queueErr as Error).message}`,
      );
      try {
        // Pass the raw data buffer and explicitly pass the deviceId 
        await this.deviceService.saveSensorData(data, deviceId);
      } catch (err) {
        this.logger.error(
          `Inline telemetry error for ${deviceId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
