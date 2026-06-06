import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import {
  TopupDelivery,
  TopupDeliveryStatus,
} from './entities/topup-delivery.entity';

@Injectable()
export class TopupDeliveryService {
  private readonly logger = new Logger(TopupDeliveryService.name);

  constructor(
    @InjectRepository(TopupDelivery)
    private readonly deliveryRepo: Repository<TopupDelivery>,
  ) {}

  async createPending(input: {
    transactionId: string;
    unitNo: string;
    deviceId: string;
    electricityAmountRp: number;
    waterAmountRp: number;
    commandTimestamp: number;
    payload: Record<string, unknown>;
  }): Promise<TopupDelivery> {
    const existing = await this.deliveryRepo.findOne({
      where: { transaction_id: input.transactionId },
    });
    if (existing) return existing;

    return this.deliveryRepo.save(
      this.deliveryRepo.create({
        transaction_id: input.transactionId,
        unit_no: input.unitNo,
        device_id: input.deviceId,
        electricity_amount_rp: input.electricityAmountRp,
        water_amount_rp: input.waterAmountRp,
        status: 'pending',
        attempt_count: 0,
        command_timestamp: input.commandTimestamp,
        payload_json: input.payload,
      }),
    );
  }

  async markSent(
    transactionId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const delivery = await this.deliveryRepo.findOne({
      where: { transaction_id: transactionId },
    });
    if (!delivery) return;
    delivery.status = 'sent';
    delivery.sent_at = new Date();
    delivery.attempt_count += 1;
    delivery.payload_json = payload;
    delivery.last_error = null;
    await this.deliveryRepo.save(delivery);
  }

  async findPendingForDevice(
    deviceId: string,
    sentBefore = new Date(Date.now() - 30_000),
    limit = 10,
  ): Promise<TopupDelivery[]> {
    return this.deliveryRepo.find({
      where: [
        {
          device_id: deviceId,
          status: 'pending',
        },
        {
          device_id: deviceId,
          status: 'sent',
          sent_at: LessThan(sentBefore),
        },
      ],
      order: { created_at: 'ASC' },
      take: limit,
    });
  }

  async markFailed(transactionId: string, error: string): Promise<void> {
    const delivery = await this.deliveryRepo.findOne({
      where: { transaction_id: transactionId },
    });
    if (!delivery) return;
    delivery.status = 'failed';
    delivery.attempt_count += 1;
    delivery.last_error = error.slice(0, 255);
    await this.deliveryRepo.save(delivery);
  }

  async markLatestAckForDevice(
    deviceId: string,
    ack: Record<string, unknown>,
  ): Promise<TopupDelivery | null> {
    const status = ack.status === 'ok' ? 'acked' : 'failed';
    const delivery = await this.deliveryRepo.findOne({
      where: {
        device_id: deviceId,
        status: In(['pending', 'sent']),
      },
      order: { sent_at: 'DESC', created_at: 'DESC' },
    });
    if (!delivery) {
      this.logger.warn(
        `TOPUP ACK received for ${deviceId}, but no delivery is pending`,
      );
      return null;
    }

    delivery.status = status as TopupDeliveryStatus;
    delivery.ack_json = ack;
    delivery.acked_at = status === 'acked' ? new Date() : null;
    const errVal = ack.error;
    delivery.last_error =
      status === 'failed'
        ? typeof errVal === 'string' || typeof errVal === 'number'
          ? String(errVal)
          : 'device rejected top-up'
        : null;
    await this.deliveryRepo.save(delivery);
    return delivery;
  }

  async findByTransactionId(
    transactionId: string,
  ): Promise<TopupDelivery | null> {
    return this.deliveryRepo.findOne({
      where: { transaction_id: transactionId },
    });
  }

  async markLatestConfirmedByTelemetry(
    deviceId: string,
    telemetry: Record<string, unknown>,
  ): Promise<TopupDelivery | null> {
    const delivery = await this.deliveryRepo.findOne({
      where: {
        device_id: deviceId,
        status: 'acked',
      },
      order: { acked_at: 'DESC', created_at: 'DESC' },
    });
    if (!delivery) return null;

    delivery.status = 'confirmed';
    delivery.confirmed_at = new Date();
    delivery.payload_json = {
      ...(delivery.payload_json ?? {}),
      confirmationTelemetry: telemetry,
    };
    delivery.last_error = null;
    await this.deliveryRepo.save(delivery);
    return delivery;
  }

  toResponse(delivery: TopupDelivery | null) {
    if (!delivery) return null;
    const ensureIso = (value: Date | null) =>
      value instanceof Date ? value.toISOString() : null;
    return {
      status: delivery.status,
      attemptCount: delivery.attempt_count,
      deviceId: delivery.device_id,
      sentAt: ensureIso(delivery.sent_at),
      ackedAt: ensureIso(delivery.acked_at),
      confirmedAt: ensureIso(delivery.confirmed_at),
      lastError: delivery.last_error,
    };
  }
}
