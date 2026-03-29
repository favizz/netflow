import { Inject, Injectable } from '@nestjs/common';
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

  getMobileAnomalies(unitNo: string) {
    return this.anomalyService.getAnomaliesForUnit(unitNo);
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
    this.mqttClient.emit(`device/${unit.device_id}/relay/set`, {
      relay: on ? 'ON' : 'OFF',
    });
    return { relayStatus: on };
  }

  async setValveByUnitNo(unitNo: string, open: boolean) {
    const unit = await this.unitService.findByUnitNo(unitNo);
    this.mqttClient.emit(`device/${unit.device_id}/valve/set`, {
      valve: open ? 'OPEN' : 'CLOSE',
    });
    return { valveStatus: open };
  }
}
