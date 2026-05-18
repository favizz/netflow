import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { encodeCommand } from '../common/binary-codec';
import { ClientProxy } from '@nestjs/microservices';
import { PaymentsService } from '../payments/payments.service';
import { ReportingService } from '../reporting/reporting.service';
import { UnitService } from '../unit/unit.service';
import { AnomalyService } from '../anomaly/anomaly.service';

@Injectable()
export class GatewayService {
  constructor(
    private readonly unitService: UnitService,
    private readonly reportingService: ReportingService,
    private readonly paymentsService: PaymentsService,
    private readonly anomalyService: AnomalyService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
  ) {}

  async getMobileDashboard(unitNo: string) {
    const summary = await this.unitService.getOwnerDashboard(unitNo);

    return {
      unitNo,
      summary,
    };
  }

  async getMobileAnomalies(unitNo: string) {
    const anomalies = await this.anomalyService.getAnomaliesForUnit(unitNo);
    const txs = await this.paymentsService.listTransactionsForUnit(unitNo);

    // Get last 5 successful transactions
    const successfulTxs = txs
      .filter((tx) => tx.status === 'success')
      .sort(
        (a, b) =>
          new Date(b.createdAt ?? '').getTime() -
          new Date(a.createdAt ?? '').getTime(),
      )
      .slice(0, 5);

    const topupNotifs = successfulTxs.map((tx) => ({
      anomalyType: 'topup_success',
      severity: 'info',
      target: 'resident',
      message: `Pembelian token sebesar Rp${Number(tx.amount).toLocaleString('id-ID')} berhasil masuk ke saldo Anda.`,
      metadata: { amount: tx.amount, tx_id: tx.id },
      detectedAt: tx.confirmedAt || tx.createdAt,
    }));

    return [...topupNotifs, ...anomalies].sort((a, b) => {
      const timeA = a.detectedAt ? new Date(a.detectedAt).getTime() : 0;
      const timeB = b.detectedAt ? new Date(b.detectedAt).getTime() : 0;
      return timeB - timeA;
    });
  }

  getMobileTrends(unitNo: string, period: 'daily' | 'monthly') {
    return this.reportingService.getConsumptionTrends(unitNo, period);
  }

  getTowerConnectivity(tower?: string) {
    return this.unitService.getTowerConnectivity(tower);
  }

  getTransactions(unitNo: string) {
    return this.paymentsService.listTransactionsForUnit(unitNo);
  }

  async setRelayByUnitNo(unitNo: string, on: boolean, actorEmail?: string) {
    const unit = await this.unitService.findByUnitNo(unitNo);
    if (!unit.device_id) throw new BadRequestException('No device assigned to this unit');
    await this.unitService.checkDeviceOnline(unit.device_id);
    await this.unitService.setRelayStatus(unit.id, on, actorEmail);
    this.publishRetained(
      `device/${unit.device_id}/command`,
      encodeCommand('relay', on ? 1 : 0),
    );
    return { relayStatus: on };
  }

  async setValveByUnitNo(unitNo: string, open: boolean, actorEmail?: string) {
    const unit = await this.unitService.findByUnitNo(unitNo);
    if (!unit.device_id) throw new BadRequestException('No device assigned to this unit');
    await this.unitService.checkDeviceOnline(unit.device_id);
    await this.unitService.setValveStatus(unit.id, open, actorEmail);
    this.publishRetained(
      `device/${unit.device_id}/command`,
      encodeCommand('valve', open ? 1 : 0),
    );
    return { valveStatus: open };
  }

  private publishRetained(topic: string, payload: Buffer): void {
    const raw = (
      this.mqttClient as unknown as {
        mqttClient?: {
          connected?: boolean;
          publish?: (...a: unknown[]) => void;
        };
      }
    ).mqttClient;
    if (raw?.connected && raw.publish) {
      raw.publish(topic, payload, { retain: true, qos: 1 });
    } else {
      this.mqttClient.emit(topic, payload);
    }
  }
}
