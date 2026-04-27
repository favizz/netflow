import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { MeterReading } from '../device/entities/device.entity';
import { Unit } from '../unit/entities/unit.entity';
import { UnitService } from '../unit/unit.service';
import { TariffService } from '../tariff/tariff.service';

export interface AnomalyScore {
  deviceId: string;
  unitNo: string;
  score: number;
  isAnomaly: boolean;
  scoredAt: string;
}

export interface DepletionForecast {
  unitNo: string;
  balanceRp: number;
  estimatedDaysRemaining: number;
  avgDailyKwh: number;
  avgDailyM3: number;
  dailyCostRp: number;
  confidence: 'high' | 'medium' | 'low';
  forecastAt: string;
}

export interface ModelInfo {
  modelFitted: boolean;
  sampleCount: number;
  source: string;
  trainedAt: number;
  threshold: number;
  featureNames: string[];
  history: Array<{ timestamp: number; sample_count: number; source: string }>;
}

interface MlModelInfoResponse {
  model_fitted: boolean;
  sample_count: number;
  source: string;
  trained_at: number;
  threshold: number;
  feature_names: string[];
  history: Array<{ timestamp: number; sample_count: number; source: string }>;
}

@Injectable()
export class MlService implements OnModuleInit {
  private readonly logger = new Logger(MlService.name);
  private readonly scoreCache = new Map<string, AnomalyScore>();
  private mlAvailable = false;

  constructor(
    private readonly http: HttpService,
    private readonly cfg: ConfigService,
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    private readonly unitService: UnitService,
    private readonly tariffService: TariffService,
  ) {}

  async onModuleInit() {
    await this.checkMlAvailability();

    const scoringIntervalSec = this.cfg.get<number>('ML_SCORING_INTERVAL_SECONDS', 300);
    if (scoringIntervalSec > 0 && this.mlAvailable) {
      setInterval(() => void this.scoreAllUnits(), scoringIntervalSec * 1_000);
    }

    // Retrain daily with real field data (runs 1 min after startup to avoid boot congestion)
    const retrainingIntervalSec = this.cfg.get<number>('ML_RETRAINING_INTERVAL_SECONDS', 86_400);
    if (retrainingIntervalSec > 0 && this.mlAvailable) {
      setTimeout(() => {
        void this.retrainWithFieldData();
        setInterval(() => void this.retrainWithFieldData(), retrainingIntervalSec * 1_000);
      }, 60_000);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async getAnomalyScore(deviceId: string): Promise<AnomalyScore | null> {
    if (this.scoreCache.has(deviceId)) return this.scoreCache.get(deviceId)!;
    return this.scoreUnit(deviceId);
  }

  getAllScores(): AnomalyScore[] {
    return [...this.scoreCache.values()];
  }

  async getModelInfo(): Promise<ModelInfo | null> {
    if (!this.mlAvailable) return null;
    try {
      const { data } = await firstValueFrom(
        this.http.get<MlModelInfoResponse>('/model/info'),
      );
      return {
        modelFitted:  data.model_fitted,
        sampleCount:  data.sample_count,
        source:       data.source,
        trainedAt:    data.trained_at,
        threshold:    data.threshold,
        featureNames: data.feature_names,
        history:      data.history,
      };
    } catch {
      return null;
    }
  }

  /**
   * Pull recent readings for all units and retrain the Isolation Forest.
   * Called daily by the scheduler. Also callable manually via admin endpoint.
   */
  async retrainWithFieldData(): Promise<{ samplesCollected: number; status: string }> {
    if (!this.mlAvailable) {
      return { samplesCollected: 0, status: 'ml_unavailable' };
    }

    try {
      // Collect last 30 days of readings across all units (capped at 50k rows for memory)
      const rows: Array<{ power: string; voltage: string; current: string; water_flow: string }> =
        await this.meterRepo.query(
          `SELECT power, voltage, current, water_flow
           FROM meter_readings
           WHERE time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             AND power IS NOT NULL AND voltage IS NOT NULL
           ORDER BY RAND()
           LIMIT 50000`,
        );

      if (rows.length < 20) {
        this.logger.warn(`ML retraining skipped — only ${rows.length} readings available (need ≥ 20)`);
        return { samplesCollected: rows.length, status: 'insufficient_data' };
      }

      const features = rows.map((r) => ({
        power:      parseFloat(r.power)      || 0,
        voltage:    parseFloat(r.voltage)    || 220,
        current:    parseFloat(r.current)    || 0,
        water_flow: parseFloat(r.water_flow) || 0,
      }));

      await firstValueFrom(
        this.http.post('/train', { features, source: 'field' }),
      );

      this.logger.log(`ML model retrained on ${rows.length} real readings`);
      this.scoreCache.clear(); // invalidate stale scores

      return { samplesCollected: rows.length, status: 'trained' };
    } catch (err) {
      this.logger.warn(`ML retraining failed: ${(err as Error).message}`);
      return { samplesCollected: 0, status: 'error' };
    }
  }

  async getDepletionForecast(unitNo: string): Promise<DepletionForecast> {
    const unit = await this.unitService.findByUnitNo(unitNo);
    const [elecTariff, waterTariff] = await Promise.all([
      this.tariffService.findCurrent('electricity'),
      this.tariffService.findCurrent('water'),
    ]);

    const stats = await this.get7DayStats(unit.device_id);
    const dailyCostRp = (stats.avgDailyKwh * elecTariff) + (stats.avgDailyM3 * waterTariff);
    const balance = Number(unit.balance);

    let estimatedDaysRemaining = 0;
    let confidence: DepletionForecast['confidence'] = 'low';

    if (dailyCostRp > 0) {
      estimatedDaysRemaining = balance / dailyCostRp;
      confidence = stats.readingDays >= 7 ? 'high' : stats.readingDays >= 3 ? 'medium' : 'low';
    }

    if (this.mlAvailable) {
      try {
        const { data } = await firstValueFrom(
          this.http.post<{ days_remaining: number }>('/predict/depletion', {
            balance_rp:    balance,
            avg_daily_kwh: stats.avgDailyKwh,
            avg_daily_m3:  stats.avgDailyM3,
            tariff_elec:   elecTariff,
            tariff_water:  waterTariff,
          }),
        );
        estimatedDaysRemaining = data.days_remaining;
        confidence = 'high';
      } catch {
        // ML unavailable — use rule-based estimate
      }
    }

    return {
      unitNo,
      balanceRp:              balance,
      estimatedDaysRemaining: parseFloat(estimatedDaysRemaining.toFixed(1)),
      avgDailyKwh:            parseFloat(stats.avgDailyKwh.toFixed(3)),
      avgDailyM3:             parseFloat(stats.avgDailyM3.toFixed(3)),
      dailyCostRp:            parseFloat(dailyCostRp.toFixed(2)),
      confidence,
      forecastAt:             new Date().toISOString(),
    };
  }

  async scoreAllUnits(): Promise<void> {
    try {
      const units = await this.unitRepo.find();
      await Promise.all(units.map(u => this.scoreUnit(u.device_id).catch(() => null)));
    } catch (err) {
      this.logger.warn(`Batch ML scoring failed: ${(err as Error).message}`);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async scoreUnit(deviceId: string): Promise<AnomalyScore | null> {
    if (!this.mlAvailable) return null;

    try {
      const unit = await this.unitRepo.findOne({ where: { device_id: deviceId } });
      if (!unit) return null;

      const readings = await this.meterRepo.find({
        where: { device_id: deviceId },
        order: { time: 'DESC' },
        take: 30,
      });
      if (readings.length < 5) return null;

      const features = readings.map(r => ({
        power:      r.power      ?? 0,
        voltage:    r.voltage    ?? 220,
        current:    r.current    ?? 0,
        water_flow: r.water_flow ?? 0,
      }));

      const { data } = await firstValueFrom(
        this.http.post<{ score: number; is_anomaly: boolean }>('/predict/anomaly', { features }),
      );

      const result: AnomalyScore = {
        deviceId,
        unitNo:    unit.unit_no,
        score:     data.score,
        isAnomaly: data.is_anomaly,
        scoredAt:  new Date().toISOString(),
      };

      this.scoreCache.set(deviceId, result);
      return result;
    } catch {
      return null;
    }
  }

  private async get7DayStats(deviceId: string) {
    const rows: Array<{ day: string; kwh: string; m3: string }> = await this.meterRepo.query(
      `SELECT DATE_FORMAT(time, '%Y-%m-%d') AS day,
              GREATEST(0, MAX(energy_total) - MIN(energy_total)) AS kwh,
              GREATEST(0, MAX(water_total)  - MIN(water_total))  AS m3
       FROM meter_readings
       WHERE device_id = ? AND time >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND energy_total IS NOT NULL
       GROUP BY DATE_FORMAT(time, '%Y-%m-%d')
       ORDER BY day`,
      [deviceId],
    );

    if (rows.length === 0) return { avgDailyKwh: 0, avgDailyM3: 0, readingDays: 0 };

    const totalKwh = rows.reduce((s, r) => s + parseFloat(r.kwh), 0);
    const totalM3  = rows.reduce((s, r) => s + parseFloat(r.m3), 0);

    return {
      avgDailyKwh: totalKwh / rows.length,
      avgDailyM3:  totalM3  / rows.length,
      readingDays: rows.length,
    };
  }

  private async checkMlAvailability(): Promise<void> {
    try {
      await firstValueFrom(this.http.get('/health'));
      this.mlAvailable = true;
      this.logger.log(`ML service reachable at ${this.cfg.get('ML_SERVICE_URL')}`);
    } catch {
      this.mlAvailable = false;
      this.logger.warn('ML service not reachable — rule-based anomaly detection only.');
    }
  }
}
