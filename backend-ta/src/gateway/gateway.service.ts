import { Inject, Injectable } from '@nestjs/common';
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
      .filter((tx: any) => tx.status === 'success')
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
      
    const topupNotifs = successfulTxs.map((tx: any) => ({
      anomalyType: 'topup_success',
      severity: 'info',
      target: 'resident',
      message: `Pembelian token sebesar Rp${Number(tx.amount).toLocaleString('id-ID')} berhasil masuk ke saldo Anda.`,
      metadata: { amount: tx.amount, tx_id: tx.id },
      detectedAt: tx.confirmedAt || tx.createdAt,
    }));
    
    return [...topupNotifs, ...anomalies].sort((a: any, b: any) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
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

  async setRelayByUnitNo(unitNo: string, on: boolean) {
    const unit = await this.unitService.findByUnitNo(unitNo);
    await this.unitService.setRelayStatus(unit.id, on);
    this.mqttClient.emit(`device/${unit.device_id}/command`, encodeCommand('relay', on ? 1 : 0));
    return { relayStatus: on };
  }

  async setValveByUnitNo(unitNo: string, open: boolean) {
    const unit = await this.unitService.findByUnitNo(unitNo);
    this.mqttClient.emit(`device/${unit.device_id}/command`, encodeCommand('valve', open ? 1 : 0));
    return { valveStatus: open };
  }
}
