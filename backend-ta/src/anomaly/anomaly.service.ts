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
import { ResidentsService } from '../residents/residents.service';

// ── Detection thresholds ────────────────────────────────────────────────────
const MCB_WATT_LIMIT = 1300;
const LOW_TOKEN_THRESHOLD_KWH = 5;
const LOW_TOKEN_THRESHOLD_M3 = 1;
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

const TELEMETRY_REFRESH_THROTTLE_MS = 30_000;

@Injectable()
export class AnomalyService implements OnModuleInit {
  private readonly anomalyCache = new Map<string, AnomalyItem[]>();
  private readonly lastTelemetryRefresh = new Map<string, number>();
  // Updated on every telemetry frame (not just when the throttled computeAll fires).
  // Used to suppress device_offline during the BullMQ processing window.
  private readonly lastTelemetryArrivalMs = new Map<string, number>();

  constructor(
    private readonly unitService: UnitService,
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    @InjectRepository(Anomaly)
    private readonly anomalyRepo: Repository<Anomaly>,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
    private readonly notificationService: NotificationService,
    private readonly residentsService: ResidentsService,
  ) {}

  private readonly lastSafetyCommandMs = new Map<string, number>();

  onModuleInit() {
    // Lightweight offline check only — does NOT run computeAll for every unit.
    // All other anomaly types are detected on-demand when telemetry arrives.
    setTimeout(() => void this.checkOfflineUnits(), 10_000);
    setInterval(() => void this.checkOfflineUnits(), 5 * 60 * 1_000);
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
    return await this.computeAll(unitNo);
  }

  checkOnTelemetry(
    deviceId: string,
    unitNo: string,
    power: number | null,
    waterFlow: number | null,
    voltage: number | null,
    tokenElec: number,
    tokenWater: number,
    relayStatus: boolean,
    valveStatus: boolean,
  ): void {
    try {
      const pw = power ?? 0;
      const vv = voltage ?? 0;
      const wf = waterFlow ?? 0;

      // Re-send cutoff commands if device didn't acknowledge: relay off when
      // token depleted or MCB/overvoltage; valve close when water token gone.
      const lastCmd = this.lastSafetyCommandMs.get(deviceId) ?? 0;
      const relayShouldCut =
        (tokenElec <= 0 && !relayStatus && pw > 5) ||
        pw > MCB_WATT_LIMIT ||
        vv > VOLTAGE_CRITICAL_HIGH;
      const valveShouldCut = tokenWater <= 0 && !valveStatus && wf > 0.1;

      if (
        (relayShouldCut || valveShouldCut) &&
        Date.now() - lastCmd > 5 * 60 * 1000
      ) {
        this.lastSafetyCommandMs.set(deviceId, Date.now());
        if (relayShouldCut) {
          this.mqttClient.emit(
            `device/${deviceId}/command`,
            encodeCommand('relay', 0),
          );
        }
        if (valveShouldCut) {
          this.mqttClient.emit(
            `device/${deviceId}/command`,
            encodeCommand('valve', 0),
          );
        }
      }

      // Receiving telemetry proves the device is online.
      this.lastTelemetryArrivalMs.set(unitNo, Date.now());
      void this.resolveOfflineAnomaly(deviceId, unitNo);

      // Throttled full check for all other anomaly types
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

  // ── Offline background check ───────────────────────────────────────────────
  // Runs every 5 min. Only checks device_offline — one indexed findOne per unit,
  // no full computeAll. All other anomaly types are detected via checkOnTelemetry.

  private async checkOfflineUnits(): Promise<void> {
    try {
      // Periodic cleanup of stale memory maps to prevent RAM growth
      this.pruneMaps();

      // Use the generator to stream units in chunks, preventing RAM spikes.
      for await (const units of this.unitService.streamAllWithDevice(100)) {
        for (const unit of units) {
          if (!unit.device_id) continue;
          try {
            const latest = await this.meterRepo.findOne({
              where: { device_id: unit.device_id },
              order: { time: 'DESC' },
            });
            const ageMs = latest
              ? Date.now() - new Date(latest.time).getTime()
              : Infinity;
            if (ageMs < OFFLINE_THRESHOLD_MS) continue;

            // Unit is offline — insert DB anomaly and notify once (deduplicated)
            const existing = await this.anomalyRepo.findOne({
              where: {
                device_id: unit.device_id,
                type: 'device_offline',
                resolved_at: IsNull(),
              },
            });
            if (!existing) {
              await this.anomalyRepo.save({
                device_id: unit.device_id,
                type: 'device_offline',
                severity: 'critical',
                description: `Perangkat unit ${unit.unit_no} offline. Tidak ada data masuk selama ${Math.floor(ageMs / 60_000)} menit.`,
                action_taken: JSON.stringify({
                  last_seen_ms: ageMs,
                  offline_threshold_ms: OFFLINE_THRESHOLD_MS,
                }),
              });
              if (unit.resident_email) {
                void this.notificationService
                  .sendResidentNotification(
                    unit.resident_email,
                    `[NetFlow Alert] DEVICE_OFFLINE — Unit ${unit.unit_no}`,
                    `Perangkat unit ${unit.unit_no} offline. Tidak ada data masuk selama ${Math.floor(ageMs / 60_000)} menit.`,
                  )
                  .catch(() => {});
              }
              void this.residentsService
                .findAdmins()
                .then((admins) => {
                  for (const admin of admins) {
                    if (admin.telegram_chat_id) {
                      void this.notificationService
                        .sendTelegram(
                          admin.telegram_chat_id,
                          `🚨 *[Admin Alert]* DEVICE_OFFLINE — Unit ${unit.unit_no}\n\nTidak ada data masuk selama ${Math.floor(ageMs / 60_000)} menit.`,
                        )
                        .catch(() => {});
                    }
                  }
                })
                .catch(() => {});
            }
          } catch {
            // Skip unit on error, continue others
          }
        }
        // Small yield to event loop
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } catch {
      // DB not ready — retry on next interval
    }
  }

  // Clears the device_offline anomaly from cache and DB the moment telemetry
  // is received, so the admin view reflects online status without delay.
  private async resolveOfflineAnomaly(
    deviceId: string,
    unitNo: string,
  ): Promise<void> {
    try {
      const cached = this.anomalyCache.get(unitNo);
      if (cached?.some((a) => a.anomalyType === 'device_offline')) {
        this.anomalyCache.set(
          unitNo,
          cached.filter((a) => a.anomalyType !== 'device_offline'),
        );
      }
      const active = await this.anomalyRepo.findOne({
        where: {
          device_id: deviceId,
          type: 'device_offline',
          resolved_at: IsNull(),
        },
      });
      if (active) {
        active.resolved_at = new Date();
        await this.anomalyRepo.save(active);
      }
    } catch {
      // Best-effort — do not propagate
    }
  }

  private async syncAnomaliesToDb(
    unitNo: string,
    computed: AnomalyItem[],
  ): Promise<void> {
    try {
      const unit = await this.unitService.findByUnitNo(unitNo);
      if (!unit || !unit.device_id) return;

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

          // Admin Telegram Notification
          if (comp.severity === 'critical' || comp.severity === 'warning') {
            void this.residentsService
              .findAdmins()
              .then((admins) => {
                for (const admin of admins) {
                  if (admin.telegram_chat_id) {
                    void this.notificationService
                      .sendTelegram(
                        admin.telegram_chat_id,
                        `🚨 *[Admin Alert]* ${comp.anomalyType.toUpperCase()} — Unit ${unitNo}\n\n${comp.message}`,
                      )
                      .catch(() => {});
                  }
                }
              })
              .catch(() => {});
          }
        }
      }
    } catch {
      // Best-effort sync
    }
  }

  private pruneMaps(): void {
    const now = Date.now();
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours

    const prune = (map: Map<string, number | any[]>) => {
      for (const [key, value] of map.entries()) {
        const timestamp = typeof value === 'number' ? value : now; // Fallback for cache
        if (now - timestamp > staleThreshold) map.delete(key);
      }
    };

    prune(this.lastTelemetryArrivalMs);
    prune(this.lastTelemetryRefresh);
    prune(this.lastSafetyCommandMs);

    // Manual prune for anomalyCache since it stores objects, not timestamps
    if (this.anomalyCache.size > 5000) this.anomalyCache.clear();
  }

  // ── Core detection ─────────────────────────────────────────────────────────

  private async computeAll(unitNo: string): Promise<AnomalyItem[]> {
    const unit = await this.unitService.findByUnitNo(unitNo);

    const anomalies: AnomalyItem[] = [];
    const now = new Date().toISOString();

    // No device assigned → cannot determine online status; skip device_offline.
    if (!unit.device_id) {
      if (
        unit.token_electricity > 0 &&
        unit.token_electricity < LOW_TOKEN_THRESHOLD_KWH
      ) {
        anomalies.push({
          anomalyType: 'low_token',
          severity: 'warning',
          target: 'resident',
          message: `Token listrik hampir habis: ${Number(unit.token_electricity).toFixed(2)} kWh. Segera top-up.`,
          metadata: {
            token_kwh: unit.token_electricity,
            threshold_kwh: LOW_TOKEN_THRESHOLD_KWH,
          },
          detectedAt: now,
        });
      }
      return anomalies;
    }

    const readings = await this.meterRepo.find({
      where: { device_id: unit.device_id },
      order: { time: 'DESC' },
      take: 60,
    });

    const latest = readings[0] ?? null;
    const arrivalMs = this.lastTelemetryArrivalMs.get(unit.unit_no) ?? 0;
    const dbAgeMs = latest
      ? Date.now() - new Date(latest.time).getTime()
      : Infinity;

    // Logic fix: A device is truly offline ONLY if no MQTT has arrived recently
    // AND the DB readings are old. This handles timezone mismatches better.
    const isMqttRecent = Date.now() - arrivalMs < 60_000;
    const isOnline = isMqttRecent || dbAgeMs < OFFLINE_THRESHOLD_MS;

    if (!isOnline) {
      anomalies.push({
        anomalyType: 'device_offline',
        severity: 'critical',
        target: 'admin',
        message: `Perangkat unit ${unitNo} offline. Tidak ada data masuk selama ${Math.floor(dbAgeMs / 60_000)} menit.`,
        metadata: {
          last_seen_ms: dbAgeMs,
          offline_threshold_ms: OFFLINE_THRESHOLD_MS,
        },
        detectedAt: now,
      });
    }

    if (unit.token_electricity > 0 && unit.token_electricity < 5) {
      anomalies.push({
        anomalyType: 'low_token',
        severity: 'warning',
        target: 'resident',
        message: `Token listrik hampir habis: ${Number(unit.token_electricity).toFixed(2)} kWh. Segera top-up.`,
        metadata: {
          token_kwh: unit.token_electricity,
          threshold_kwh: 5,
        },
        detectedAt: now,
      });
    }

    if (unit.token_water > 0 && unit.token_water < LOW_TOKEN_THRESHOLD_M3) {
      anomalies.push({
        anomalyType: 'low_token',
        severity: 'warning',
        target: 'resident',
        message: `Token air hampir habis: ${Number(unit.token_water).toFixed(2)} m³. Segera top-up.`,
        metadata: {
          token_m3: unit.token_water,
          threshold_m3: LOW_TOKEN_THRESHOLD_M3,
        },
        detectedAt: now,
      });
    }

    // Don't return early if offline! We still want to see the last detected
    // anomalies from the data we DO have.
    if (!latest) return anomalies;

    const last10 = readings.slice(0, 10);
    if (last10.length >= 5) {
      // Logic fix: 0 is a VALID reading (sensor is alive, just no load).
      // Sensor malfunction only fires if data is strictly NULL or NaN (missing).
      const allNull = last10.every((r) => {
        const isNull = (v: unknown) =>
          v === null || v === undefined || isNaN(Number(v));
        return isNull(r.power) && isNull(r.voltage) && isNull(r.water_flow);
      });

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

    const pw = latest.power ?? 0;
    const wf = latest.water_flow ?? 0;

    const elecBypassed =
      Number(unit.token_electricity) <= 0 && !unit.relay_status && pw > 5;
    const waterBypassed =
      Number(unit.token_water) <= 0 && !unit.valve_status && wf > 0.1;
    if (elecBypassed || waterBypassed) {
      const parts: string[] = [];
      if (elecBypassed) parts.push(`listrik: ${pw.toFixed(0)} W (relay OFF)`);
      if (waterBypassed)
        parts.push(`air: ${wf.toFixed(2)} L/min (valve CLOSE)`);
      anomalies.push({
        anomalyType: 'jailbreak',
        severity: 'critical',
        target: 'admin',
        message: `Bypass terdeteksi pada unit ${unitNo}: cutoff aktif tapi sensor masih aktif — ${parts.join(', ')}.`,
        metadata: {
          token_kwh: unit.token_electricity,
          token_m3: unit.token_water,
          relay_status: unit.relay_status,
          valve_status: unit.valve_status,
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
