import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { MeterReading } from '../device/entities/device.entity';
import { UnitService } from '../unit/unit.service';
import type { AnomalyItem } from './anomaly.types';

// ── Detection thresholds ────────────────────────────────────────────────────
const MCB_WATT_LIMIT          = 1300;
const LOW_BALANCE_THRESHOLD   = 20_000;
const OFFLINE_THRESHOLD_MS    = 10 * 60 * 1_000; // 10 minutes
const VOLTAGE_MIN             = 198;   // 220 V − 10%
const VOLTAGE_MAX             = 242;   // 220 V + 10%
const VOLTAGE_CRITICAL_LOW    = 180;
const VOLTAGE_CRITICAL_HIGH   = 250;
const WATER_LEAK_MAX_COV      = 0.20;
const WATER_LEAK_MIN_FLOW_LPM = 0.3;
const LOW_PF_THRESHOLD        = 0.60;
const LOW_PF_MIN_POWER_W      = 50;    // ignore PF when load is negligible
const SPIKE_MULTIPLIER        = 3.0;
const SPIKE_MIN_BASELINE_W    = 100;   // only flag spike if baseline is meaningful
const SPIKE_MIN_W             = 500;

// Background cache refresh interval
const CACHE_REFRESH_MS = 2 * 60 * 1_000; // 2 minutes
// Throttle: max one full cache refresh per unit per MQTT telemetry interval
const TELEMETRY_REFRESH_THROTTLE_MS = 30_000;

@Injectable()
export class AnomalyService implements OnModuleInit {
  private readonly anomalyCache     = new Map<string, AnomalyItem[]>();
  private readonly lastTelemetryRefresh = new Map<string, number>();

  constructor(
    private readonly unitService: UnitService,
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onModuleInit() {
    // Allow DB connections to stabilise before first run
    setTimeout(() => void this.refreshAllUnitsCache(), 5_000);
    setInterval(() => void this.refreshAllUnitsCache(), CACHE_REFRESH_MS);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns anomalies for a resident — admin-only anomalies are filtered out.
   * Serves from in-memory cache; falls back to live query on cache miss.
   */
  async getAnomaliesForUnit(unitNo: string): Promise<AnomalyItem[]> {
    if (!this.anomalyCache.has(unitNo)) {
      const all = await this.computeAll(unitNo);
      this.anomalyCache.set(unitNo, all);
    }
    return (this.anomalyCache.get(unitNo) ?? []).filter((a) => a.target !== 'admin');
  }

  /**
   * Called by DeviceService after every successful telemetry save.
   * Issues immediate MQTT relay-off commands for safety-critical anomalies.
   * Also refreshes the anomaly cache for this unit (throttled to once per 30 s).
   * Must be called with `void` — errors are swallowed internally.
   */
  async checkOnTelemetry(
    deviceId: string,
    unitNo: string,
    power: number | null,
    waterFlow: number | null,
    voltage: number | null,
    balance: number,
    relayStatus: boolean,
  ): Promise<void> {
    try {
      const pw = power ?? 0;
      const wf = waterFlow ?? 0;
      const vv = voltage ?? 0;

      // Anomali 1 — Jailbreak: relay OFF but sensors show active consumption
      if (balance <= 0 && !relayStatus && (pw > 5 || wf > 0.1)) {
        this.mqttClient.emit(`device/${deviceId}/relay/set`, {
          relay: 'OFF',
          reason: 'JAILBREAK_DETECTED',
        });
      }

      // Anomali 4 — MCB Trip: cut relay to protect equipment on next reset
      if (pw > MCB_WATT_LIMIT) {
        this.mqttClient.emit(`device/${deviceId}/relay/set`, {
          relay: 'OFF',
          reason: 'MCB_TRIP',
        });
      }

      // Anomali 6 — Critical overvoltage: protect appliances
      if (vv > VOLTAGE_CRITICAL_HIGH) {
        this.mqttClient.emit(`device/${deviceId}/relay/set`, {
          relay: 'OFF',
          reason: 'OVERVOLTAGE',
        });
      }

      // Refresh the anomaly cache for this unit (throttled)
      const last = this.lastTelemetryRefresh.get(unitNo) ?? 0;
      if (Date.now() - last > TELEMETRY_REFRESH_THROTTLE_MS) {
        this.lastTelemetryRefresh.set(unitNo, Date.now());
        void this.computeAll(unitNo)
          .then((a) => this.anomalyCache.set(unitNo, a))
          .catch(() => {});
      }
    } catch {
      // Anomaly check failures must not propagate to the telemetry pipeline
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
            this.anomalyCache.set(unit.unit_no, anomalies);
          } catch {
            // Keep stale cache — better than showing nothing
          }
        }),
      );
    } catch {
      // DB not ready or other transient error — will retry on next interval
    }
  }

  // ── Core detection ─────────────────────────────────────────────────────────

  /**
   * Runs all anomaly checks for a unit using a single bulk reading query.
   * Returns the full set including admin-only anomalies.
   */
  private async computeAll(unitNo: string): Promise<AnomalyItem[]> {
    const unit = await this.unitService.findByUnitNo(unitNo);

    // One query covers all multi-reading checks (60 rows max)
    const readings = await this.meterRepo.find({
      where: { device_id: unit.device_id },
      order: { time: 'DESC' },
      take: 60,
    });

    const latest = readings[0] ?? null;
    const anomalies: AnomalyItem[] = [];
    const now = new Date().toISOString();

    const ageMs   = latest ? Date.now() - new Date(latest.time).getTime() : Infinity;
    const isOnline = ageMs < OFFLINE_THRESHOLD_MS;

    // ── Anomali 3: Device Offline ──────────────────────────────────────────
    if (!isOnline) {
      anomalies.push({
        anomalyType: 'device_offline',
        severity: 'critical',
        target: 'admin',
        message: `Perangkat unit ${unitNo} offline. Tidak ada data masuk selama ${Math.floor(ageMs / 60_000)} menit.`,
        metadata: { last_seen_ms: ageMs, offline_threshold_ms: OFFLINE_THRESHOLD_MS },
        detectedAt: now,
      });
    }

    // ── Anomali 5: Low Balance ─────────────────────────────────────────────
    if (unit.balance > 0 && unit.balance < LOW_BALANCE_THRESHOLD) {
      anomalies.push({
        anomalyType: 'low_balance',
        severity: 'warning',
        target: 'resident',
        message: `Saldo hampir habis: Rp${Math.floor(unit.balance).toLocaleString('id-ID')}. Segera top-up untuk menghindari pemutusan layanan.`,
        metadata: { balance_rp: unit.balance, threshold_rp: LOW_BALANCE_THRESHOLD },
        detectedAt: now,
      });
    }

    if (!latest || !isOnline) return anomalies;

    // ── Anomali 7: Sensor Malfunction ──────────────────────────────────────
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
          message: `Sensor tidak merespons: ${last10.length} pembacaan terakhir semua bernilai kosong. Kemungkinan kerusakan sensor atau kabel longgar.`,
          metadata: { readings_checked: last10.length },
          detectedAt: now,
        });
        // Sensor is malfunctioning — skip checks that rely on sensor values
        return anomalies;
      }
    }

    // ── Anomali 11: Backflow ───────────────────────────────────────────────
    if (latest.water_flow !== null && latest.water_flow < -0.1) {
      anomalies.push({
        anomalyType: 'backflow',
        severity: 'warning',
        target: 'both',
        message: `Aliran air balik (backflow) terdeteksi: ${latest.water_flow.toFixed(2)} L/menit. Kemungkinan pemasangan meter terbalik atau tekanan balik pipa.`,
        metadata: { flow_lpm: latest.water_flow },
        detectedAt: now,
      });
    }

    // ── Anomali 1: Jailbreak ───────────────────────────────────────────────
    const pw = latest.power ?? 0;
    const wf = latest.water_flow ?? 0;
    if (unit.balance <= 0 && !unit.relay_status && (pw > 5 || wf > 0.1)) {
      anomalies.push({
        anomalyType: 'jailbreak',
        severity: 'critical',
        target: 'admin',
        message: `Bypass sistem terdeteksi pada unit ${unitNo}: saldo habis dan relay OFF, namun sensor masih melaporkan konsumsi (daya: ${pw.toFixed(0)} W, debit: ${wf.toFixed(2)} L/min).`,
        metadata: { balance_rp: unit.balance, relay_status: unit.relay_status, power_w: pw, flow_lpm: wf },
        detectedAt: now,
      });
    }

    // ── Anomali 4: MCB Trip ────────────────────────────────────────────────
    if (pw > MCB_WATT_LIMIT) {
      anomalies.push({
        anomalyType: 'mcb_trip',
        severity: 'critical',
        target: 'both',
        message: `Daya aktif melebihi kapasitas MCB: ${pw.toFixed(0)} W (batas ${MCB_WATT_LIMIT} W). MCB kemungkinan trip — kurangi beban listrik lalu nyalakan kembali relay.`,
        metadata: { power_w: pw, limit_w: MCB_WATT_LIMIT },
        detectedAt: now,
      });
    }

    // ── Anomali 6: Voltage Anomaly ─────────────────────────────────────────
    if (latest.voltage !== null && latest.voltage > 0) {
      const v = latest.voltage;
      if (v < VOLTAGE_MIN || v > VOLTAGE_MAX) {
        const isCritical = v < VOLTAGE_CRITICAL_LOW || v > VOLTAGE_CRITICAL_HIGH;
        const isOver     = v > VOLTAGE_MAX;
        anomalies.push({
          anomalyType: 'voltage_anomaly',
          severity: isCritical ? 'critical' : 'warning',
          target: 'both',
          message: isOver
            ? `Tegangan terlalu tinggi: ${v.toFixed(1)} V (aman: ${VOLTAGE_MIN}–${VOLTAGE_MAX} V). Hentikan pemakaian perangkat sensitif segera.`
            : `Tegangan terlalu rendah: ${v.toFixed(1)} V (aman: ${VOLTAGE_MIN}–${VOLTAGE_MAX} V). Perangkat mungkin tidak bekerja optimal.`,
          metadata: { voltage_v: v, safe_min_v: VOLTAGE_MIN, safe_max_v: VOLTAGE_MAX },
          detectedAt: now,
        });
      }
    }

    // ── Anomali 8: Low Power Factor ────────────────────────────────────────
    if (
      latest.power !== null &&
      latest.voltage !== null &&
      latest.current !== null &&
      latest.current > 0.1 &&
      latest.power > LOW_PF_MIN_POWER_W
    ) {
      const apparentPower = latest.voltage * latest.current;
      if (apparentPower > 0) {
        const pf = latest.power / apparentPower;
        if (pf < LOW_PF_THRESHOLD) {
          anomalies.push({
            anomalyType: 'low_power_factor',
            severity: 'warning',
            target: 'both',
            message: `Faktor daya rendah: ${(pf * 100).toFixed(0)}% (minimum ${LOW_PF_THRESHOLD * 100}%). Beban induktif berlebih — pertimbangkan pemasangan kapasitor koreksi.`,
            metadata: {
              power_factor: parseFloat(pf.toFixed(3)),
              real_w: latest.power,
              apparent_va: parseFloat(apparentPower.toFixed(2)),
            },
            detectedAt: now,
          });
        }
      }
    }

    // ── Anomali 10: Usage Spike ────────────────────────────────────────────
    const powerReadings = readings
      .map((r) => r.power)
      .filter((p): p is number => p !== null && p >= 0);

    if (powerReadings.length >= 10 && (latest.power ?? 0) > 0) {
      // Baseline: exclude the most recent 5 readings to prevent the spike from biasing avg
      const baseline = powerReadings.slice(5);
      if (baseline.length >= 5) {
        const avgBaseline = baseline.reduce((a, b) => a + b, 0) / baseline.length;
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
            message: `Lonjakan konsumsi listrik: ${currentPower.toFixed(0)} W (${(currentPower / avgBaseline).toFixed(1)}× rata-rata ${avgBaseline.toFixed(0)} W). Periksa perangkat yang baru dinyalakan.`,
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

    // ── Anomali 9: Extended Zero Flow ─────────────────────────────────────
    // Only flag if relay is ON and balance > 0 (expected to have flow available)
    if (unit.relay_status && unit.balance > 0) {
      const flowReadings = readings.slice(0, 20).filter((r) => r.water_flow !== null);
      if (flowReadings.length >= 15) {
        const zeroCount = flowReadings.filter((r) => (r.water_flow ?? 0) <= 0.05).length;
        if (zeroCount === flowReadings.length) {
          anomalies.push({
            anomalyType: 'zero_flow',
            severity: 'warning',
            target: 'both',
            message: `Tidak ada aliran air selama ${flowReadings.length} pembacaan terakhir meski layanan aktif. Kemungkinan pipa tersumbat, katup tertutup, atau suplai air terputus.`,
            metadata: { zero_readings: zeroCount, readings_checked: flowReadings.length },
            detectedAt: now,
          });
        }
      }
    }

    // ── Anomali 2: Water Leak (CoV test — expensive, runs last) ───────────
    const leakAnomaly = this.detectWaterLeak(readings);
    if (leakAnomaly) anomalies.push(leakAnomaly);

    return anomalies;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private detectWaterLeak(readings: MeterReading[]): AnomalyItem | null {
    if (readings.length < 30) return null;

    const flows = readings
      .map((r) => r.water_flow)
      .filter((f): f is number => f !== null);

    const nonZero = flows.filter((f) => f > 0.05);

    // Must be running continuously (≥90% non-zero — system never rested)
    if (nonZero.length < readings.length * 0.9) return null;
    if (nonZero.length < 30) return null;

    const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
    if (mean < WATER_LEAK_MIN_FLOW_LPM) return null;

    const variance =
      nonZero.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / nonZero.length;
    const cov = Math.sqrt(variance) / mean;

    // CoV < 0.20: suspiciously constant flow — not normal human usage pattern
    if (cov >= WATER_LEAK_MAX_COV) return null;

    return {
      anomalyType: 'water_leak',
      severity: 'warning',
      target: 'both',
      message: `Kemungkinan kebocoran air. Debit rata-rata ${mean.toFixed(2)} L/menit mengalir konstan tanpa henti dalam ${readings.length} pembacaan terakhir. Periksa pipa, kran, dan toilet.`,
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
