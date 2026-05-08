import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Repository, IsNull } from 'typeorm';
import { MeterReading } from '../device/entities/device.entity';
import { UnitService } from '../unit/unit.service';
import type { AnomalyItem, AnomalyType } from './anomaly.types';
import { Anomaly } from './entities/anomaly.entity';
import { encodeCommand } from '../common/binary-codec';
import { NotificationService } from '../notification/notification.service';

// ── Detection thresholds ────────────────────────────────────────────────────
const MCB_WATT_LIMIT = 1300;
const LOW_BALANCE_THRESHOLD = 20_000;
const OFFLINE_THRESHOLD_MS = 10 * 60 * 1_000;
const VOLTAGE_MIN = 198;
const VOLTAGE_MAX = 242;
const VOLTAGE_CRITICAL_LOW = 180;
const VOLTAGE_CRITICAL_HIGH = 250;
const WATER_LEAK_MAX_COV = 0.2;
const WATER_LEAK_MIN_FLOW_LPM = 0.3;
const LOW_PF_THRESHOLD = 0.6;
const LOW_PF_MIN_POWER_W = 50;
const SPIKE_MULTIPLIER = 3.0;
const SPIKE_MIN_BASELINE_W = 100;
const SPIKE_MIN_W = 500;

const CACHE_REFRESH_MS = 2 * 60 * 1_000;
const TELEMETRY_REFRESH_THROTTLE_MS = 30_000;

@Injectable()
export class AnomalyService implements OnModuleInit {
  private readonly anomalyCache = new Map<string, AnomalyItem[]>();
  private readonly lastTelemetryRefresh = new Map<string, number>();

  constructor(
    private readonly unitService: UnitService,
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    @InjectRepository(Anomaly)
    private readonly anomalyRepo: Repository<Anomaly>,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit() {
    setTimeout(() => void this.refreshAllUnitsCache(), 5_000);
    setInterval(() => void this.refreshAllUnitsCache(), CACHE_REFRESH_MS);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async getAnomaliesForUnit(unitNo: string): Promise<AnomalyItem[]> {
    if (!this.anomalyCache.has(unitNo)) {
      const all = await this.computeAll(unitNo);
      this.anomalyCache.set(unitNo, all);
    }
    return (this.anomalyCache.get(unitNo) ?? []).filter(
      (a) => a.target !== 'admin',
    );
  }

  async getAllAnomaliesForUnit(unitNo: string): Promise<AnomalyItem[]> {
    if (!this.anomalyCache.has(unitNo)) {
      const all = await this.computeAll(unitNo);
      this.anomalyCache.set(unitNo, all);
    }
    return this.anomalyCache.get(unitNo) ?? [];
  }

  checkOnTelemetry(
    deviceId: string,
    unitNo: string,
    power: number | null,
    waterFlow: number | null,
    voltage: number | null,
    balance: number,
    relayStatus: boolean,
  ): void {
    try {
      const pw = power ?? 0;
      const vv = voltage ?? 0;
      const wf = waterFlow ?? 0;

      // Safety cutoffs - use binary-encoded commands for hardware compatibility
      if (balance <= 0 && !relayStatus && (pw > 5 || wf > 0.1)) {
        this.mqttClient.emit(
          `device/${deviceId}/command`,
          encodeCommand('relay', 0),
        );
      }
      if (pw > MCB_WATT_LIMIT) {
        this.mqttClient.emit(
          `device/${deviceId}/command`,
          encodeCommand('relay', 0),
        );
      }
      if (vv > VOLTAGE_CRITICAL_HIGH) {
        this.mqttClient.emit(
          `device/${deviceId}/command`,
          encodeCommand('relay', 0),
        );
      }

      const last = this.lastTelemetryRefresh.get(unitNo) ?? 0;
      if (Date.now() - last > TELEMETRY_REFRESH_THROTTLE_MS) {
        this.lastTelemetryRefresh.set(unitNo, Date.now());
        void this.computeAll(unitNo)
          .then(async (a) => {
            await this.syncAnomaliesToDb(unitNo, a);
            this.anomalyCache.set(unitNo, a);
          })
          .catch(() => {});
      }
    } catch {
      // Must not propagate to telemetry pipeline
    }
  }

  // ── Background refresh ─────────────────────────────────────────────────────

  private async refreshAllUnitsCache(): Promise<void> {
    try {
      const units = await this.unitService.findAll();
      await Promise.all(
        units.map(async (unit) => {
          try {
            const anomalies = await this.computeAll(unit.unit_no);
            await this.syncAnomaliesToDb(unit.unit_no, anomalies);
            this.anomalyCache.set(unit.unit_no, anomalies);
          } catch {
            // Keep stale cache
          }
        }),
      );
    } catch {
      // DB not ready - retry next interval
    }
  }

  private async syncAnomaliesToDb(
    unitNo: string,
    computed: AnomalyItem[],
  ): Promise<void> {
    try {
      const unit = await this.unitService.findByUnitNo(unitNo);
      if (!unit) return;

      const activeAnomalies = await this.anomalyRepo.find({
        where: { device_id: unit.device_id, resolved_at: IsNull() },
      });

      const computedTypes = computed.map((c) => c.anomalyType);
      const activeTypes = activeAnomalies.map((a) => a.type);

      // Mark resolved
      for (const active of activeAnomalies) {
        if (!computedTypes.includes(active.type as AnomalyType)) {
          active.resolved_at = new Date();
          await this.anomalyRepo.save(active);
        }
      }

      // Insert new
      for (const comp of computed) {
        if (!activeTypes.includes(comp.anomalyType)) {
          await this.anomalyRepo.save({
            device_id: unit.device_id,
            type: comp.anomalyType,
            severity: comp.severity,
            description: comp.message,
            action_taken: JSON.stringify(comp.metadata),
          });

          // Proactive Resident Notification (Spec 2.1.8)
          if (
            unit.resident_email &&
            (comp.severity === 'critical' || comp.severity === 'warning')
          ) {
            const subject = `[NetFlow Alert] ${comp.anomalyType.toUpperCase()} on Unit ${unitNo}`;
            void this.notificationService
              .sendResidentNotification(
                unit.resident_email,
                subject,
                comp.message,
              )
              .catch(() => {});
          }
        }
      }
    } catch {
      // Best-effort sync
    }
  }

  // ── Core detection ─────────────────────────────────────────────────────────

  private async computeAll(unitNo: string): Promise<AnomalyItem[]> {
    const unit = await this.unitService.findByUnitNo(unitNo);

    const readings = await this.meterRepo.find({
      where: { device_id: unit.device_id },
      order: { time: 'DESC' },
      take: 60,
    });

    const latest = readings[0] ?? null;
    const anomalies: AnomalyItem[] = [];
    const now = new Date().toISOString();
    const ageMs = latest
      ? Date.now() - new Date(latest.time).getTime()
      : Infinity;
    const isOnline = ageMs < OFFLINE_THRESHOLD_MS;

    if (!isOnline) {
      anomalies.push({
        anomalyType: 'device_offline',
        severity: 'critical',
        target: 'admin',
        message: `Perangkat unit ${unitNo} offline. Tidak ada data masuk selama ${Math.floor(ageMs / 60_000)} menit.`,
        metadata: {
          last_seen_ms: ageMs,
          offline_threshold_ms: OFFLINE_THRESHOLD_MS,
        },
        detectedAt: now,
      });
    }

    if (unit.balance > 0 && unit.balance < LOW_BALANCE_THRESHOLD) {
      anomalies.push({
        anomalyType: 'low_balance',
        severity: 'warning',
        target: 'resident',
        message: `Saldo hampir habis: Rp${Math.floor(unit.balance).toLocaleString('id-ID')}. Segera top-up.`,
        metadata: {
          balance_rp: unit.balance,
          threshold_rp: LOW_BALANCE_THRESHOLD,
        },
        detectedAt: now,
      });
    }

    if (!latest || !isOnline) return anomalies;

    const last10 = readings.slice(0, 10);
    if (last10.length >= 5) {
      const allNull = last10.every(
        (r) => r.power === null && r.voltage === null && r.water_flow === null,
      );
      if (allNull) {
        anomalies.push({
          anomalyType: 'sensor_malfunction',
          severity: 'warning',
          target: 'both',
          message: `Sensor tidak merespons: ${last10.length} pembacaan terakhir semua kosong.`,
          metadata: { readings_checked: last10.length },
          detectedAt: now,
        });
        return anomalies;
      }
    }

    if (latest.water_flow !== null && latest.water_flow < -0.1) {
      anomalies.push({
        anomalyType: 'backflow',
        severity: 'warning',
        target: 'both',
        message: `Aliran air balik: ${latest.water_flow.toFixed(2)} L/menit.`,
        metadata: { flow_lpm: latest.water_flow },
        detectedAt: now,
      });
    }

    const pw = latest.power ?? 0;
    const wf = latest.water_flow ?? 0;

    if (unit.balance <= 0 && !unit.relay_status && (pw > 5 || wf > 0.1)) {
      anomalies.push({
        anomalyType: 'jailbreak',
        severity: 'critical',
        target: 'admin',
        message: `Bypass terdeteksi pada unit ${unitNo}: saldo habis dan relay OFF, sensor masih aktif (${pw.toFixed(0)} W, ${wf.toFixed(2)} L/min).`,
        metadata: {
          balance_rp: unit.balance,
          relay_status: unit.relay_status,
          power_w: pw,
          flow_lpm: wf,
        },
        detectedAt: now,
      });
    }

    if (pw > MCB_WATT_LIMIT) {
      anomalies.push({
        anomalyType: 'mcb_trip',
        severity: 'critical',
        target: 'both',
        message: `Daya melebihi kapasitas MCB: ${pw.toFixed(0)} W (batas ${MCB_WATT_LIMIT} W).`,
        metadata: { power_w: pw, limit_w: MCB_WATT_LIMIT },
        detectedAt: now,
      });
    }

    if (latest.voltage !== null && latest.voltage > 0) {
      const v = latest.voltage;
      if (v < VOLTAGE_MIN || v > VOLTAGE_MAX) {
        const isCritical =
          v < VOLTAGE_CRITICAL_LOW || v > VOLTAGE_CRITICAL_HIGH;
        anomalies.push({
          anomalyType: 'voltage_anomaly',
          severity: isCritical ? 'critical' : 'warning',
          target: 'both',
          message:
            v > VOLTAGE_MAX
              ? `Tegangan terlalu tinggi: ${v.toFixed(1)} V (aman: ${VOLTAGE_MIN}–${VOLTAGE_MAX} V).`
              : `Tegangan terlalu rendah: ${v.toFixed(1)} V (aman: ${VOLTAGE_MIN}–${VOLTAGE_MAX} V).`,
          metadata: {
            voltage_v: v,
            safe_min_v: VOLTAGE_MIN,
            safe_max_v: VOLTAGE_MAX,
          },
          detectedAt: now,
        });
      }
    }

    if (
      latest.power !== null &&
      latest.voltage !== null &&
      latest.current !== null &&
      latest.current > 0.1 &&
      latest.power > LOW_PF_MIN_POWER_W
    ) {
      const apparent = latest.voltage * latest.current;
      if (apparent > 0) {
        const pf = latest.power / apparent;
        if (pf < LOW_PF_THRESHOLD) {
          anomalies.push({
            anomalyType: 'low_power_factor',
            severity: 'warning',
            target: 'both',
            message: `Faktor daya rendah: ${(pf * 100).toFixed(0)}% (minimum ${LOW_PF_THRESHOLD * 100}%).`,
            metadata: {
              power_factor: parseFloat(pf.toFixed(3)),
              real_w: latest.power,
              apparent_va: parseFloat(apparent.toFixed(2)),
            },
            detectedAt: now,
          });
        }
      }
    }

    const powerReadings = readings
      .map((r) => r.power)
      .filter((p): p is number => p !== null && p >= 0);
    if (powerReadings.length >= 10 && (latest.power ?? 0) > 0) {
      const baseline = powerReadings.slice(5);
      if (baseline.length >= 5) {
        const avgBaseline =
          baseline.reduce((a, b) => a + b, 0) / baseline.length;
        const currentPower = latest.power ?? 0;
        if (
          avgBaseline > SPIKE_MIN_BASELINE_W &&
          currentPower > avgBaseline * SPIKE_MULTIPLIER &&
          currentPower > SPIKE_MIN_W
        ) {
          anomalies.push({
            anomalyType: 'usage_spike',
            severity: 'warning',
            target: 'both',
            message: `Lonjakan konsumsi: ${currentPower.toFixed(0)} W (${(currentPower / avgBaseline).toFixed(1)}× rata-rata ${avgBaseline.toFixed(0)} W).`,
            metadata: {
              current_w: currentPower,
              baseline_avg_w: parseFloat(avgBaseline.toFixed(2)),
              multiplier: parseFloat((currentPower / avgBaseline).toFixed(2)),
            },
            detectedAt: now,
          });
        }
      }
    }

    if (unit.relay_status && unit.balance > 0) {
      const flowReadings = readings
        .slice(0, 20)
        .filter((r) => r.water_flow !== null);
      if (flowReadings.length >= 15) {
        const zeroCount = flowReadings.filter(
          (r) => (r.water_flow ?? 0) <= 0.05,
        ).length;
        if (zeroCount === flowReadings.length) {
          anomalies.push({
            anomalyType: 'zero_flow',
            severity: 'warning',
            target: 'both',
            message: `Tidak ada aliran air selama ${flowReadings.length} pembacaan meski layanan aktif.`,
            metadata: {
              zero_readings: zeroCount,
              readings_checked: flowReadings.length,
            },
            detectedAt: now,
          });
        }
      }
    }

    const leakAnomaly = this.detectWaterLeak(readings);
    if (leakAnomaly) anomalies.push(leakAnomaly);

    return anomalies;
  }

  private detectWaterLeak(readings: MeterReading[]): AnomalyItem | null {
    if (readings.length < 30) return null;
    const flows = readings
      .map((r) => r.water_flow)
      .filter((f): f is number => f !== null);
    const nonZero = flows.filter((f) => f > 0.05);
    if (nonZero.length < readings.length * 0.9 || nonZero.length < 30)
      return null;
    const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
    if (mean < WATER_LEAK_MIN_FLOW_LPM) return null;
    const variance =
      nonZero.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) /
      nonZero.length;
    const cov = Math.sqrt(variance) / mean;
    if (cov >= WATER_LEAK_MAX_COV) return null;
    return {
      anomalyType: 'water_leak',
      severity: 'warning',
      target: 'both',
      message: `Kemungkinan kebocoran: debit rata-rata ${mean.toFixed(2)} L/menit konstan dalam ${readings.length} pembacaan.`,
      metadata: {
        mean_lpm: parseFloat(mean.toFixed(3)),
        cov: parseFloat(cov.toFixed(3)),
        readings_checked: readings.length,
      },
      detectedAt: new Date().toISOString(),
    };
  }
}
