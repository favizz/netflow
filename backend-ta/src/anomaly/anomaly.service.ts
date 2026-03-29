import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { MeterReading } from '../device/entities/device.entity';
import { UnitService } from '../unit/unit.service';
import type { AnomalyItem } from './anomaly.types';

const MCB_WATT_LIMIT = 1300;
const LOW_BALANCE_THRESHOLD = 20_000;
const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000;
const VOLTAGE_MIN = 198;    // 220 V - 10%
const VOLTAGE_MAX = 242;    // 220 V + 10%
const VOLTAGE_CRITICAL_LOW = 180;
const VOLTAGE_CRITICAL_HIGH = 250;
const WATER_LEAK_WINDOW = 60;
const WATER_LEAK_MAX_COV = 0.20;
const WATER_LEAK_MIN_FLOW_LPM = 0.3;

@Injectable()
export class AnomalyService {
  constructor(
    private readonly unitService: UnitService,
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
  ) {}

  /**
   * Returns anomalies visible to the unit resident.
   * Admin-only anomalies (jailbreak, device_offline) are excluded.
   */
  async getAnomaliesForUnit(unitNo: string): Promise<AnomalyItem[]> {
    const unit = await this.unitService.findByUnitNo(unitNo);
    const latest = await this.meterRepo.findOne({
      where: { device_id: unit.device_id },
      order: { time: 'DESC' },
    });

    const anomalies: AnomalyItem[] = [];
    const now = new Date().toISOString();

    // --- Anomali 5: Low Balance ---
    if (unit.balance > 0 && unit.balance < LOW_BALANCE_THRESHOLD) {
      anomalies.push({
        anomalyType: 'low_balance',
        severity: 'warning',
        message: `Saldo hampir habis: Rp${Math.floor(unit.balance).toLocaleString('id-ID')}. Segera top-up untuk menghindari pemutusan layanan.`,
        metadata: { balance_rp: unit.balance, threshold_rp: LOW_BALANCE_THRESHOLD },
        detectedAt: now,
      });
    }

    if (!latest) return anomalies;

    const lastSeenMs = Date.now() - new Date(latest.time).getTime();
    const isOnline = lastSeenMs < OFFLINE_THRESHOLD_MS;

    // --- Anomali 4: MCB Trip ---
    if (isOnline && (latest.power ?? 0) > MCB_WATT_LIMIT) {
      anomalies.push({
        anomalyType: 'mcb_trip',
        severity: 'critical',
        message: `Daya aktif melebihi kapasitas MCB: ${latest.power?.toFixed(0)} W (batas ${MCB_WATT_LIMIT} W). MCB kemungkinan trip — kurangi beban listrik lalu nyalakan kembali relay.`,
        metadata: { power_w: latest.power, limit_w: MCB_WATT_LIMIT },
        detectedAt: now,
      });
    }

    // --- Anomali 6: Voltage Anomaly ---
    if (isOnline && latest.voltage !== null && latest.voltage > 0) {
      const v = latest.voltage;
      if (v < VOLTAGE_MIN || v > VOLTAGE_MAX) {
        const isCritical = v < VOLTAGE_CRITICAL_LOW || v > VOLTAGE_CRITICAL_HIGH;
        const isOver = v > VOLTAGE_MAX;
        anomalies.push({
          anomalyType: 'voltage_anomaly',
          severity: isCritical ? 'critical' : 'warning',
          message: isOver
            ? `Tegangan terlalu tinggi: ${v.toFixed(1)} V (aman: ${VOLTAGE_MIN}–${VOLTAGE_MAX} V). Hentikan pemakaian perangkat sensitif segera.`
            : `Tegangan terlalu rendah: ${v.toFixed(1)} V (aman: ${VOLTAGE_MIN}–${VOLTAGE_MAX} V). Perangkat mungkin tidak bekerja optimal.`,
          metadata: {
            voltage_v: v,
            safe_min_v: VOLTAGE_MIN,
            safe_max_v: VOLTAGE_MAX,
          },
          detectedAt: now,
        });
      }
    }

    // --- Anomali 2: Water Leak (aggregated — check last) ---
    if (isOnline) {
      const leakAnomaly = await this.checkWaterLeak(unit.device_id);
      if (leakAnomaly) anomalies.push(leakAnomaly);
    }

    return anomalies;
  }

  /**
   * Called by DeviceService after every successful telemetry save.
   * Issues automatic MQTT relay-off for Jailbreak and MCB Trip.
   * Must be called with void — errors are swallowed internally.
   */
  async checkOnTelemetry(
    deviceId: string,
    power: number | null,
    waterFlow: number | null,
    balance: number,
    relayStatus: boolean,
  ): Promise<void> {
    try {
      const pw = power ?? 0;
      const wf = waterFlow ?? 0;

      // Anomali 1: Jailbreak — relay is OFF but sensors show active consumption
      if (balance <= 0 && !relayStatus && (pw > 5 || wf > 0.1)) {
        this.mqttClient.emit(`device/${deviceId}/relay/set`, {
          relay: 'OFF',
          reason: 'JAILBREAK_DETECTED',
        });
      }

      // Anomali 4: MCB Trip — cut relay to protect equipment on reset
      if (pw > MCB_WATT_LIMIT) {
        this.mqttClient.emit(`device/${deviceId}/relay/set`, {
          relay: 'OFF',
          reason: 'MCB_TRIP',
        });
      }

      // Anomali 6: Critical overvoltage — cut relay to protect appliances
      // (voltage is not passed to this method; handled on the GET side for residents)
    } catch {
      // Anomaly check failures must not propagate to the telemetry pipeline
    }
  }

  private async checkWaterLeak(deviceId: string): Promise<AnomalyItem | null> {
    const readings = await this.meterRepo.find({
      where: { device_id: deviceId },
      order: { time: 'DESC' },
      take: WATER_LEAK_WINDOW,
      select: { water_flow: true, time: true },
    });

    if (readings.length < 30) return null;

    const flows = readings
      .map((r) => r.water_flow)
      .filter((f): f is number => f !== null);

    // Noise filter: treat < 0.05 L/min as zero (sensor noise floor)
    const nonZero = flows.filter((f) => f > 0.05);

    // Condition: ≥90% of readings show continuous flow (system never rested)
    if (nonZero.length < readings.length * 0.9) return null;
    if (nonZero.length < 30) return null;

    const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
    if (mean < WATER_LEAK_MIN_FLOW_LPM) return null;

    const variance =
      nonZero.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / nonZero.length;
    const cov = Math.sqrt(variance) / mean;

    // CoV < 0.20 means flow is suspiciously constant (not normal human usage pattern)
    if (cov >= WATER_LEAK_MAX_COV) return null;

    return {
      anomalyType: 'water_leak',
      severity: 'warning',
      message: `Kemungkinan kebocoran air. Debit rata-rata ${mean.toFixed(2)} L/menit mengalir konstan tanpa henti selama ${readings.length} pembacaan terakhir. Segera periksa pipa dan kran.`,
      metadata: {
        mean_lpm: parseFloat(mean.toFixed(3)),
        cov: parseFloat(cov.toFixed(3)),
        readings_checked: readings.length,
        non_zero_count: nonZero.length,
      },
      detectedAt: new Date().toISOString(),
    };
  }
}
