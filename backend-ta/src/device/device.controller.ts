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
import { AuditLogService } from '../admin/audit-log/audit-log.service';
import { TopupDeliveryService } from '../payments/topup-delivery.service';
import { UnitService } from '../admin/unit/unit.service';

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
    private readonly topupDeliveryService: TopupDeliveryService,
    private readonly unitService: UnitService,
  ) {}

  /**
   * Device presence via the retained `device/{id}/status` topic.
   * Payload is `{ online: true }` on connect and the literal `offline` on a
   * clean shutdown or via Last-Will when the device drops ungracefully.
   * This is the authoritative online/offline signal for the dashboards.
   */
  @MessagePattern('device/+/status')
  handleStatus(@Payload() data: unknown, @Ctx() ctx: MqttContext): void {
    const topic = ctx.getTopic();
    const deviceId = topic.split('/')[1] ?? 'unknown';

    const raw = Buffer.isBuffer(data)
      ? data.toString('utf8')
      : typeof data === 'string'
        ? data
        : JSON.stringify(data ?? '');

    let online = false;
    const trimmed = raw.trim();
    if (trimmed === 'offline') {
      online = false;
    } else if (trimmed === 'online') {
      online = true;
    } else {
      try {
        const parsed = JSON.parse(trimmed) as { online?: boolean };
        online = parsed?.online === true;
      } catch {
        online = false;
      }
    }

    this.logger.log(`STATUS [${deviceId}] → ${online ? 'online' : 'offline'}`);
    this.unitService.setPresence(deviceId, online);
  }

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
    void this.topupDeliveryService.markLatestAckForDevice(
      deviceId,
      ack as Record<string, unknown>,
    );
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
  async handleSensorData(@Payload() data: unknown, @Ctx() ctx: MqttContext) {
    const topic: string = ctx.getTopic();
    const deviceId = topic.split('/')[1] ?? null;

    let buf: Buffer | null = null;
    const d = data as Record<string, unknown>;

    if (Buffer.isBuffer(data)) {
      buf = data;
    } else if (typeof data === 'string') {
      buf = Buffer.from(data, 'latin1');
    } else if (data instanceof Uint8Array) {
      buf = Buffer.from(data);
    } else if (
      d &&
      d.type === 'Buffer' &&
      Array.isArray(d.data) &&
      (d.data as unknown[]).every((v) => typeof v === 'number')
    ) {
      buf = Buffer.from(d.data as number[]);
    } else if (typeof data === 'object' && data !== null) {
      // Catch the case where NestJS passes a raw 25-byte Buffer as { "0": 0, ... }.
      // Do not convert arbitrary numeric JSON such as { temperature, humidity }.
      const keys = Object.keys(d);
      const isIndexedBuffer =
        keys.length === 25 && keys.every((key, index) => key === String(index));
      if (isIndexedBuffer) {
        const values = keys.map((key) => d[key]);
        if (values.every((v) => typeof v === 'number')) {
          buf = Buffer.from(values);
        }
      }
    }

    let payload: Record<string, unknown>;
    if (buf) {
      // Serialize buffer as base64 so BullMQ can store it in Redis JSON.
      payload = {
        _isBuffer: true,
        _data: buf.toString('base64'),
        _deviceId: deviceId,
      };
    } else {
      payload = { ...d, _deviceId: deviceId };
    }

    try {
      await this.telemetryQueue.add('process', payload, {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 1,
      });
    } catch (queueErr) {
      // Redis unavailable — fall back to inline processing (same as v1).
      this.logger.warn(
        `Queue unavailable, processing inline: ${(queueErr as Error).message}`,
      );
      try {
        // Pass the raw data buffer and explicitly pass the deviceId
        await this.deviceService.saveSensorData(buf || data, deviceId);
      } catch (err) {
        this.logger.error(
          `Inline telemetry error for ${deviceId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
