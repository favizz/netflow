import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { TopupDelivery } from '../payments/entities/topup-delivery.entity';
import { TopupDeliveryService } from '../payments/topup-delivery.service';
import { encodeCommand, encodeTopup } from '../common/binary-codec';

@Injectable()
export class TopupDeliveryPublisherService {
  private readonly logger = new Logger(TopupDeliveryPublisherService.name);
  private publishing = false;

  constructor(
    private readonly topupDeliveryService: TopupDeliveryService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
  ) {}

  async publishDelivery(delivery: TopupDelivery): Promise<void> {
    const commandTimestamp =
      delivery.command_timestamp ?? Math.floor(Date.now() / 1000);
    const payloadJson = {
      electricAmountRp: Number(delivery.electricity_amount_rp),
      waterAmountRp: Number(delivery.water_amount_rp),
      timestamp: commandTimestamp,
    };
    const payload = encodeTopup({
      electricAmount: Number(delivery.electricity_amount_rp),
      waterAmount: Number(delivery.water_amount_rp),
      timestamp: commandTimestamp,
    });

    this.publishMqtt(`device/${delivery.device_id}/topup`, payload);
    await this.topupDeliveryService.markSent(
      delivery.transaction_id,
      payloadJson,
    );

    if (Number(delivery.electricity_amount_rp) > 0) {
      this.publishMqtt(
        `device/${delivery.device_id}/command`,
        encodeCommand('relay', 1),
      );
    }
    if (Number(delivery.water_amount_rp) > 0) {
      this.publishMqtt(
        `device/${delivery.device_id}/command`,
        encodeCommand('valve', 1),
      );
    }
  }

  @Interval(30_000)
  async retryUnackedDeliveries(): Promise<void> {
    if (this.publishing) return;
    this.publishing = true;
    try {
      const olderThan = new Date(Date.now() - 30_000);
      const deliveries =
        await this.topupDeliveryService.findRetryableDeliveries(olderThan);
      for (const delivery of deliveries) {
        if (delivery.attempt_count >= 20) {
          await this.topupDeliveryService.markRetryExhausted(delivery);
          continue;
        }
        this.logger.log(
          `Retrying top-up delivery ${delivery.transaction_id} to ${delivery.device_id} (attempt ${delivery.attempt_count + 1})`,
        );
        await this.publishDelivery(delivery);
      }
    } catch (err) {
      this.logger.error(
        `Top-up retry worker failed: ${(err as Error).message}`,
      );
    } finally {
      this.publishing = false;
    }
  }

  private publishMqtt(topic: string, payload: Buffer): void {
    const raw = (
      this.mqttClient as unknown as {
        mqttClient?: {
          connected?: boolean;
          publish?: (...a: unknown[]) => void;
        };
      }
    ).mqttClient;
    if (raw?.connected && raw.publish) {
      raw.publish(topic, payload, { qos: 1, retain: false });
      return;
    }
    this.mqttClient.emit(topic, payload);
  }
}
