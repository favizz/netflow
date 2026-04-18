import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { UnitService } from '../unit/unit.service';
import { PaymentsService } from '../payments/payments.service';
import { encodeCalibration } from '../common/binary-codec';

export interface CalibrationSettings {
  CAL_FACTOR_FLOWRATE: number;
  CAL_FACTOR_POWER: number;
  SENSOR_SAMPLING_TIME: number;
}

const DEFAULT_SETTINGS: CalibrationSettings = {
  CAL_FACTOR_FLOWRATE: 4.55,
  CAL_FACTOR_POWER: 1.05,
  SENSOR_SAMPLING_TIME: 5,
};

@Injectable()
export class AdminService {
  private settings: CalibrationSettings = { ...DEFAULT_SETTINGS };

  constructor(
    private readonly unitService: UnitService,
    private readonly paymentsService: PaymentsService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
  ) {}

  // ── Transactions ──────────────────────────────────────────────────────────

  async getTransactions() {
    const rawTxs = await this.paymentsService.listAllTransactions();
    const units = await this.unitService.findAll();

    const unitMap = new Map(units.map(u => [u.unit_no, u.resident_email || 'Unassigned']));

    return rawTxs.map(tx => ({
      ...tx,
      user: unitMap.get(tx.unitNo) || 'Unassigned',
      date: tx.createdAt,
      type: 'Token Purchase',
    }));
  }

  // ── Calibration settings ──────────────────────────────────────────────────

  getSettings(): CalibrationSettings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<CalibrationSettings>): CalibrationSettings {
    if (patch.CAL_FACTOR_FLOWRATE !== undefined) {
      this.settings.CAL_FACTOR_FLOWRATE = Math.min(5, Math.max(0, Number(patch.CAL_FACTOR_FLOWRATE)));
    }
    if (patch.CAL_FACTOR_POWER !== undefined) {
      this.settings.CAL_FACTOR_POWER = Math.min(2, Math.max(0, Number(patch.CAL_FACTOR_POWER)));
    }
    if (patch.SENSOR_SAMPLING_TIME !== undefined) {
      this.settings.SENSOR_SAMPLING_TIME = Math.min(10, Math.max(1, Math.round(Number(patch.SENSOR_SAMPLING_TIME))));
    }
    return { ...this.settings };
  }

  async pushConfigToDevice(deviceId: string, overrides?: Partial<CalibrationSettings>): Promise<void> {
    const merged = overrides ? { ...this.settings, ...overrides } : this.settings;

    this.mqttClient.emit(
      `device/${deviceId}/config`,
      encodeCalibration({
        cf: merged.CAL_FACTOR_FLOWRATE,
        cp: merged.CAL_FACTOR_POWER,
        st: merged.SENSOR_SAMPLING_TIME,
      }),
    );
  }

  async pushConfigToAll(): Promise<{ pushed: string[] }> {
    const units = await this.unitService.findAll();
    for (const unit of units) {
      await this.pushConfigToDevice(unit.device_id);
    }
    return { pushed: units.map(u => u.device_id) };
  }
}
