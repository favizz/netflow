import { Injectable } from '@nestjs/common';
import { PaymentsService } from '../payments/payments.service';
import { ReportingService } from '../reporting/reporting.service';
import { UnitService } from '../unit/unit.service';

@Injectable()
export class GatewayService {
  constructor(
    private readonly unitService: UnitService,
    private readonly reportingService: ReportingService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async getMobileDashboard(unitNo: string) {
    const summary = await this.unitService.getOwnerDashboard(unitNo);
    const notifications = await this.unitService.getUnitNotifications(unitNo);

    return {
      unitNo,
      summary,
      notifications,
    };
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
}
