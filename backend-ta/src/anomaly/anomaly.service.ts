import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Repository, IsNull } from 'typeorm';
import { MeterReading } from '../device/entities/device.entity';
import { UnitService } from '../admin/unit/unit.service';
import { encodeCommand } from '../common/binary-codec';
import { ANOMALY_DETECTION_CONFIG as CFG } from './anomaly.constants';
import type { AnomalyItem, AnomalyType } from './anomaly.types';
import { Anomaly } from './entities/anomaly.entity';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { AnomalyNotificationService, OfflineUnitSummary } from './anomaly-notification.service';

/**
 * Orchestrates the anomaly detection lifecycle:
 * scheduling, in-memory caching, DB persistence, safety actuation, and notification routing.
 * Detection logic is delegated to AnomalyDetectionService.
 * Notification dispatch is delegated to AnomalyNotificationService.
 */
@Injectable()
export class AnomalyService implements OnModuleInit {
  private readonly logger = new Logger(AnomalyService.name);

  private readonly anomalyCache = new Map<string, AnomalyItem[]>();
  private readonly lastTelemetryRefreshMs = new Map<string, number>();
  private readonly lastTelemetryArrivalMs = new Map<string, number>();
  private readonly lastSafetyCommandMs = new Map<string, number>();

  constructor(
    private readonly unitService: UnitService,
    @InjectRepository(MeterReading)
    private readonly meterReadingRepo: Repository<MeterReading>,
    @InjectRepository(Anomaly)
    private readonly anomalyRepo: Repository<Anomaly>,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
    private readonly detectionService: AnomalyDetectionService,
    private readonly notificationService: AnomalyNotificationService,
  ) {}

  onModuleInit(): void {
    setTimeout(() => void this.checkOfflineUnits(), CFG.offlineCheckInitialDelayMs);
    setInterval(() => void this.checkOfflineUnits(), CFG.offlineCheckIntervalMs);
  }

  /**
   * Returns the cached anomaly list for a unit, filtered to resident-visible anomalies only.
   * Triggers a synchronous cache population on first call for a given unit.
   *
   * @param unitNumber - The unit identifier to query.
   * @returns Array of anomalies visible to the resident (excludes admin-only items).
   */
  async getAnomaliesForUnit(unitNumber: string): Promise<AnomalyItem[]> {
    if (!this.anomalyCache.has(unitNumber)) {
      const detectedAnomalies = await this.computeAndCacheAnomalies(unitNumber);
      return detectedAnomalies.filter((anomaly) => anomaly.target !== 'admin');
    }
    return (this.anomalyCache.get(unitNumber) ?? []).filter(
      (anomaly) => anomaly.target !== 'admin',
    );
  }

  /**
   * Returns the full anomaly list for a unit including admin-only anomalies.
   * Forces a fresh computation regardless of cache state.
   *
   * @param unitNumber - The unit identifier to query.
   * @returns Complete array of all detected anomalies for the unit.
   */
  async getAllAnomaliesForUnit(unitNumber: string): Promise<AnomalyItem[]> {
    return this.computeAndCacheAnomalies(unitNumber);
  }

  /**
   * Hot-path entry point called synchronously after every telemetry DB commit.
   * Performs immediate safety actuation checks and throttled anomaly cache refresh.
   * Must never throw — any error is silently swallowed to protect the telemetry pipeline.
   *
   * @param deviceId - Hardware device identifier.
   * @param unitNumber - Unit identifier mapped to this device.
   * @param powerWatts - Current active power reading in Watts, null if unavailable.
   * @param flowLitresPerMin - Current water flow rate in L/min, null if unavailable.
   * @param voltageVolts - Current line voltage in Volts, null if unavailable.
   * @param tokenElectricityKwh - Remaining electricity token balance in kWh.
   * @param tokenWaterM3 - Remaining water token balance in m³.
   * @param relayStatus - Current relay state (true = ON).
   * @param valveStatus - Current valve state (true = OPEN).
   */
  checkOnTelemetry(
    deviceId: string,
    unitNumber: string,
    powerWatts: number | null,
    flowLitresPerMin: number | null,
    voltageVolts: number | null,
    tokenElectricityKwh: number,
    tokenWaterM3: number,
    relayStatus: boolean,
    valveStatus: boolean,
  ): void {
    try {
      this.emitSafetyCommandsIfRequired(
        deviceId,
        {
          unit: {
            unit_no: unitNumber,
            device_id: deviceId,
            token_electricity: tokenElectricityKwh,
            token_water: tokenWaterM3,
            relay_status: relayStatus,
            valve_status: valveStatus,
            resident_email: null,
          },
          powerWatts: powerWatts ?? 0,
          voltageVolts: voltageVolts ?? 0,
          flowLitresPerMin: flowLitresPerMin ?? 0,
        },
      );

      this.lastTelemetryArrivalMs.set(unitNumber, Date.now());
      void this.resolveOfflineAnomaly(deviceId, unitNumber);

      const lastRefreshMs = this.lastTelemetryRefreshMs.get(unitNumber) ?? 0;
      const throttleWindowExpired =
        Date.now() - lastRefreshMs > CFG.telemetryThrottleMs;

      if (!throttleWindowExpired) return;

      this.lastTelemetryRefreshMs.set(unitNumber, Date.now());
      void this.computeAndCacheAnomalies(unitNumber)
        .then((detectedAnomalies) =>
          this.syncAnomaliesToDatabase(unitNumber, detectedAnomalies),
        )
        .catch((error: unknown) => {
          this.logger.warn(
            `Throttled anomaly sync failed for ${unitNumber}: ${(error as Error).message}`,
          );
        });
    } catch (error: unknown) {
      this.logger.warn(
        `checkOnTelemetry error for ${unitNumber}: ${(error as Error).message}`,
      );
    }
  }

  private emitSafetyCommandsIfRequired(
    deviceId: string,
    context: {
      unit: Parameters<AnomalyDetectionService['detectSafetyCommands']>[0]['unit'];
      powerWatts: number;
      voltageVolts: number;
      flowLitresPerMin: number;
    },
  ): void {
    const safetyCommands = this.detectionService.detectSafetyCommands(context);

    for (const command of safetyCommands) {
      const lastCommandMs = this.lastSafetyCommandMs.get(command.deviceId) ?? 0;
      const cooldownElapsed =
        Date.now() - lastCommandMs > CFG.safetyCommandCooldownMs;

      if (!cooldownElapsed) continue;

      this.lastSafetyCommandMs.set(command.deviceId, Date.now());
      this.mqttClient.emit(
        `device/${command.deviceId}/command`,
        encodeCommand(command.actuatorType, 0),
      );
      this.logger.warn(
        `Safety command emitted: actuator=${command.actuatorType} reason=${command.triggerReason} device=${command.deviceId}`,
      );
    }
  }

  private async checkOfflineUnits(): Promise<void> {
    try {
      this.pruneMaps();
      const newlyOfflineUnitSummaries: OfflineUnitSummary[] = [];

      for await (const unitBatch of this.unitService.streamAllWithDevice(
        CFG.offlineStreamChunkSize,
      )) {
        for (const unit of unitBatch) {
          if (!unit.device_id) continue;
          await this.processOfflineCheckForUnit(
            { ...unit, device_id: unit.device_id },
            newlyOfflineUnitSummaries,
          );
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
      }

      if (newlyOfflineUnitSummaries.length > 0) {
        void this.notificationService
          .notifyAdminsOfOfflineUnits(newlyOfflineUnitSummaries)
          .catch((error: unknown) => {
            this.logger.warn(
              `Admin offline batch notification failed: ${(error as Error).message}`,
            );
          });
      }
    } catch (error: unknown) {
      this.logger.warn(
        `checkOfflineUnits failed (DB may not be ready): ${(error as Error).message}`,
      );
    }
  }

  private async processOfflineCheckForUnit(
    unit: { device_id: string; unit_no: string; resident_email: string | null },
    newlyOfflineUnitSummaries: OfflineUnitSummary[],
  ): Promise<void> {
    try {
      const latestReading = await this.meterReadingRepo.findOne({
        where: { device_id: unit.device_id },
        order: { time: 'DESC' },
      });

      const offlineDurationMs = latestReading
        ? Date.now() - new Date(latestReading.time).getTime()
        : Infinity;

      if (offlineDurationMs < CFG.offlineThresholdMs) return;

      const existingOfflineAnomaly = await this.anomalyRepo.findOne({
        where: {
          device_id: unit.device_id,
          type: 'device_offline',
          resolved_at: IsNull(),
        },
      });

      if (existingOfflineAnomaly) return;

      const offlineDurationMinutes = Math.floor(offlineDurationMs / 60_000);

      await this.anomalyRepo.save({
        device_id: unit.device_id,
        type: 'device_offline',
        severity: 'critical',
        description: `Perangkat unit ${unit.unit_no} offline. Tidak ada data masuk selama ${offlineDurationMinutes} menit.`,
        action_taken: JSON.stringify({
          lastSeenMs: offlineDurationMs,
          offlineThresholdMs: CFG.offlineThresholdMs,
        }),
      });

      newlyOfflineUnitSummaries.push({
        unitNumber: unit.unit_no,
        offlineDurationMinutes,
      });

      if (unit.resident_email) {
        void this.notificationService
          .notifyResidentOfAnomaly(
            unit.resident_email,
            {
              anomalyType: 'device_offline',
              severity: 'critical',
              target: 'admin',
              message: `Perangkat unit ${unit.unit_no} offline. Tidak ada data masuk selama ${offlineDurationMinutes} menit.`,
              metadata: { offlineDurationMinutes },
              detectedAt: new Date().toISOString(),
            },
            unit.unit_no,
          )
          .catch(() => {});
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Offline check failed for unit ${unit.unit_no}: ${(error as Error).message}`,
      );
    }
  }

  private async resolveOfflineAnomaly(
    deviceId: string,
    unitNumber: string,
  ): Promise<void> {
    try {
      const cachedAnomalies = this.anomalyCache.get(unitNumber);
      if (cachedAnomalies?.some((anomaly) => anomaly.anomalyType === 'device_offline')) {
        this.anomalyCache.set(
          unitNumber,
          cachedAnomalies.filter((anomaly) => anomaly.anomalyType !== 'device_offline'),
        );
      }

      const activeOfflineAnomaly = await this.anomalyRepo.findOne({
        where: {
          device_id: deviceId,
          type: 'device_offline',
          resolved_at: IsNull(),
        },
      });

      if (!activeOfflineAnomaly) return;

      activeOfflineAnomaly.resolved_at = new Date();
      await this.anomalyRepo.save(activeOfflineAnomaly);
    } catch (error: unknown) {
      this.logger.warn(
        `resolveOfflineAnomaly failed for ${deviceId}: ${(error as Error).message}`,
      );
    }
  }

  private async syncAnomaliesToDatabase(
    unitNumber: string,
    computedAnomalies: AnomalyItem[],
  ): Promise<void> {
    try {
      const unit = await this.unitService.findByUnitNo(unitNumber);
      if (!unit?.device_id) return;

      const activeAnomaliesInDb = await this.anomalyRepo.find({
        where: { device_id: unit.device_id, resolved_at: IsNull() },
      });

      const computedAnomalyTypes = computedAnomalies.map(
        (anomaly) => anomaly.anomalyType,
      );
      const activeAnomalyTypesInDb = activeAnomaliesInDb.map(
        (anomaly) => anomaly.type as AnomalyType,
      );

      for (const activeAnomaly of activeAnomaliesInDb) {
        if (computedAnomalyTypes.includes(activeAnomaly.type as AnomalyType)) continue;
        activeAnomaly.resolved_at = new Date();
        await this.anomalyRepo.save(activeAnomaly);
      }

      for (const computedAnomaly of computedAnomalies) {
        if (activeAnomalyTypesInDb.includes(computedAnomaly.anomalyType)) continue;

        await this.anomalyRepo.save({
          device_id: unit.device_id,
          type: computedAnomaly.anomalyType,
          severity: computedAnomaly.severity,
          description: computedAnomaly.message,
          action_taken: JSON.stringify(computedAnomaly.metadata),
        });

        const shouldNotifyResident =
          unit.resident_email &&
          (computedAnomaly.severity === 'critical' ||
            computedAnomaly.severity === 'warning') &&
          computedAnomaly.target !== 'admin';

        if (shouldNotifyResident) {
          void this.notificationService
            .notifyResidentOfAnomaly(
              unit.resident_email as string,
              computedAnomaly,
              unitNumber,
            )
            .catch(() => {});
        }

        const shouldNotifyAdmin =
          computedAnomaly.severity === 'critical' ||
          computedAnomaly.severity === 'warning';

        if (shouldNotifyAdmin) {
          void this.notificationService
            .notifyAdminsOfAnomaly(computedAnomaly, unitNumber)
            .catch(() => {});
        }
      }
    } catch (error: unknown) {
      this.logger.warn(
        `syncAnomaliesToDatabase failed for ${unitNumber}: ${(error as Error).message}`,
      );
    }
  }

  private async computeAndCacheAnomalies(unitNumber: string): Promise<AnomalyItem[]> {
    const unit = await this.unitService.findByUnitNo(unitNumber);

    const readings = unit.device_id
      ? await this.meterReadingRepo.find({
          where: { device_id: unit.device_id },
          order: { time: 'DESC' },
          take: CFG.meterReadingsWindowSize,
        })
      : [];

    const detectionContext = {
      unit: {
        unit_no: unit.unit_no,
        device_id: unit.device_id,
        token_electricity: Number(unit.token_electricity),
        token_water: Number(unit.token_water),
        relay_status: unit.relay_status,
        valve_status: unit.valve_status,
        resident_email: unit.resident_email,
      },
      readings,
      latestMqttArrivalMs: this.lastTelemetryArrivalMs.get(unitNumber) ?? 0,
      detectionTimestamp: new Date().toISOString(),
    };

    const detectedAnomalies = this.detectionService.detectAll(detectionContext);
    this.anomalyCache.set(unitNumber, detectedAnomalies);
    return detectedAnomalies;
  }

  private pruneMaps(): void {
    const now = Date.now();
    const staleThresholdMs = CFG.memoryPruneAgeMs;

    for (const [key, timestamp] of this.lastTelemetryArrivalMs.entries()) {
      if (now - timestamp > staleThresholdMs) this.lastTelemetryArrivalMs.delete(key);
    }
    for (const [key, timestamp] of this.lastTelemetryRefreshMs.entries()) {
      if (now - timestamp > staleThresholdMs) this.lastTelemetryRefreshMs.delete(key);
    }
    for (const [key, timestamp] of this.lastSafetyCommandMs.entries()) {
      if (now - timestamp > staleThresholdMs) this.lastSafetyCommandMs.delete(key);
    }
    if (this.anomalyCache.size > CFG.anomalyCacheMaxSize) {
      this.anomalyCache.clear();
    }
  }
}
