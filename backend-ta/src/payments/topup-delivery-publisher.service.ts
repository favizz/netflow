import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { TopupDelivery } from './entities/topup-delivery.entity';
import { TopupDeliveryService } from './topup-delivery.service';
import { encodeCommand, encodeTopup } from '../common/binary-codec';
import { TariffService } from '../admin/tariff/tariff.service';

@Injectable()
export class TopupDeliveryPublisherService {
  private readonly logger = new Logger(TopupDeliveryPublisherService.name);
  private readonly publishingDevices = new Set<string>();

  constructor(
    private readonly topupDeliveryService: TopupDeliveryService,
    private readonly tariffService: TariffService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
  ) {}

  async publishDelivery(delivery: TopupDelivery): Promise<void> {
    const commandTimestamp =
      delivery.command_timestamp ?? Math.floor(Date.now() / 1000);
    const electricityAmountRp = Number(delivery.electricity_amount_rp);
    const waterAmountRp = Number(delivery.water_amount_rp);
    const [electricityTariff, waterTariff] = await Promise.all([
      electricityAmountRp > 0
        ? this.tariffService.findCurrent('electricity')
        : Promise.resolve(1),
      waterAmountRp > 0
        ? this.tariffService.findCurrent('water')
        : Promise.resolve(1),
    ]);
    const electricTokenKwh =
      electricityAmountRp > 0 ? electricityAmountRp / electricityTariff : 0;
    const waterTokenM3 = waterAmountRp > 0 ? waterAmountRp / waterTariff : 0;
    const payloadJson = {
      electricAmountRp: electricityAmountRp,
      waterAmountRp,
      electricTokenKwh,
      waterTokenM3,
      electricityTariff,
      waterTariff,
      timestamp: commandTimestamp,
    };
    const payload = encodeTopup({
      electricTokenKwh,
      waterTokenM3,
      timestamp: commandTimestamp,
    });

    this.publishMqtt(`device/${delivery.device_id}/topup`, payload);
    await this.topupDeliveryService.markSent(
      delivery.transaction_id,
      payloadJson,
    );

    if (electricTokenKwh > 0) {
      this.publishMqtt(
        `device/${delivery.device_id}/command`,
        encodeCommand('relay', 1),
      );
    }
    if (waterTokenM3 > 0) {
      this.publishMqtt(
        `device/${delivery.device_id}/command`,
        encodeCommand('valve', 1),
      );
    }
  }

  async publishPendingForDevice(deviceId: string): Promise<void> {
    if (this.publishingDevices.has(deviceId)) return;
    this.publishingDevices.add(deviceId);
    try {
      const deliveries = await this.topupDeliveryService.findPendingForDevice(
        deviceId,
      );
      for (const delivery of deliveries) {
        this.logger.log(
          `Publishing pending top-up delivery ${delivery.transaction_id} after telemetry from ${deviceId}`,
        );
        await this.publishDelivery(delivery);
      }
    } catch (err) {
      this.logger.error(
        `Telemetry-triggered top-up publish failed for ${deviceId}: ${(err as Error).message}`,
      );
    } finally {
      this.publishingDevices.delete(deviceId);
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
