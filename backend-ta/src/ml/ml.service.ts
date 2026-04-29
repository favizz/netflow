import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

interface FeatureStats {
  mean: number;
  std: number;
}

interface ModelStats {
  power: FeatureStats;
  voltage: FeatureStats;
  current: FeatureStats;
  water_flow: FeatureStats;
  sampleCount: number;
  trainedAt: number;
  history: Array<{ timestamp: number; sample_count: number; source: string }>;
}

@Injectable()
export class MlService implements OnModuleInit {
  private readonly logger = new Logger(MlService.name);
  private readonly scoreCache = new Map<string, AnomalyScore>();
  private mlAvailable = false;
  private modelStats: ModelStats | null = null;

  // Z-score above this threshold → anomaly flag
  private static readonly ANOMALY_THRESHOLD = 2.5;
  // Minimum sample count before the model is considered fitted
  private static readonly MIN_SAMPLES = 20;

  constructor(
    private readonly cfg: ConfigService,
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    private readonly unitService: UnitService,
    private readonly tariffService: TariffService,
  ) {}

  async onModuleInit() {
    await this.initModel();

    const scoringIntervalSec = this.cfg.get<number>('ML_SCORING_INTERVAL_SECONDS', 300);
    if (scoringIntervalSec > 0 && this.mlAvailable) {
      setInterval(() => void this.scoreAllUnits(), scoringIntervalSec * 1_000);
    }

    // Retrain daily with real field data (runs 1 min after startup to avoid boot congestion)
    const retrainingIntervalSec = this.cfg.get<number>('ML_RETRAINING_INTERVAL_SECONDS', 86_400);
    if (retrainingIntervalSec > 0) {
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

<<<<<<< HEAD
  getModelInfo(): ModelInfo | null {
=======
  async getModelInfo(): Promise<ModelInfo | null> {
>>>>>>> 482885c5cbd5c464b595ed7e5b547f72c416672a
    if (!this.mlAvailable || !this.modelStats) return null;
    return {
      modelFitted:  true,
      sampleCount:  this.modelStats.sampleCount,
      source:       'in-process-zscore',
      trainedAt:    this.modelStats.trainedAt,
      threshold:    MlService.ANOMALY_THRESHOLD,
      featureNames: ['power', 'voltage', 'current', 'water_flow'],
      history:      this.modelStats.history,
    };
  }

  /**
   * Pull recent readings for all units and recompute feature statistics.
   * Called daily by the scheduler. Also callable manually via admin endpoint.
   * Uses Z-score (Gaussian) statistical model — no external service required.
   */
  async retrainWithFieldData(): Promise<{ samplesCollected: number; status: string }> {
    try {
      const rows: Array<{ power: string; voltage: string; current: string; water_flow: string }> =
        await this.meterRepo.query(
          `SELECT power, voltage, current, water_flow
           FROM meter_readings
           WHERE time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             AND power IS NOT NULL AND voltage IS NOT NULL
           ORDER BY RAND()
           LIMIT 50000`,
        );

      if (rows.length < MlService.MIN_SAMPLES) {
        this.logger.warn(`ML retraining skipped — only ${rows.length} readings available (need ≥ ${MlService.MIN_SAMPLES})`);
        return { samplesCollected: rows.length, status: 'insufficient_data' };
      }

      const features = rows.map((r) => ({
        power:      parseFloat(r.power)      || 0,
        voltage:    parseFloat(r.voltage)    || 220,
        current:    parseFloat(r.current)    || 0,
        water_flow: parseFloat(r.water_flow) || 0,
      }));

      const stats = this.computeFeatureStats(features);
      const prev = this.modelStats;
      this.modelStats = {
        ...stats,
        sampleCount: rows.length,
        trainedAt:   Date.now(),
        history: [
          ...(prev?.history ?? []).slice(-9),
          { timestamp: Date.now(), sample_count: rows.length, source: 'field' },
        ],
      };
      this.mlAvailable = true;
      this.scoreCache.clear();
      this.logger.log(`ML model retrained on ${rows.length} real readings`);
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

  private async initModel(): Promise<void> {
    const result = await this.retrainWithFieldData();
    if (result.status === 'trained') {
      this.logger.log(`In-process ML model ready — ${result.samplesCollected} samples, Z-score threshold ${MlService.ANOMALY_THRESHOLD}`);
    } else {
      this.logger.warn(`ML model deferred — ${result.status} (${result.samplesCollected} samples). Will retry after first retraining interval.`);
    }
  }

  private async scoreUnit(deviceId: string): Promise<AnomalyScore | null> {
    if (!this.mlAvailable || !this.modelStats) return null;

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
        power:      Number(r.power)      || 0,
        voltage:    Number(r.voltage)    || 220,
        current:    Number(r.current)    || 0,
        water_flow: Number(r.water_flow) || 0,
      }));

      const { score, isAnomaly } = this.computeScore(features);
      const result: AnomalyScore = {
        deviceId,
        unitNo:    unit.unit_no,
        score,
        isAnomaly,
        scoredAt:  new Date().toISOString(),
      };

      this.scoreCache.set(deviceId, result);
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Score a window of readings using per-feature Z-score.
   * Score = 95th-percentile of max-Z across all readings in the window.
   * Reason: 95th percentile is robust to individual noisy readings while
   * still detecting sustained deviations.
   */
  private computeScore(features: Array<{ power: number; voltage: number; current: number; water_flow: number }>): { score: number; isAnomaly: boolean } {
    if (!this.modelStats) return { score: 0, isAnomaly: false };
    const s = this.modelStats;

    const perReadingMax = features.map(f => Math.max(
      this.zScore(f.power,      s.power),
      this.zScore(f.voltage,    s.voltage),
      this.zScore(f.current,    s.current),
      this.zScore(f.water_flow, s.water_flow),
    ));

    const sorted = [...perReadingMax].sort((a, b) => a - b);
    const p95idx = Math.floor(sorted.length * 0.95);
    const score = parseFloat((sorted[p95idx] ?? sorted[sorted.length - 1]).toFixed(4));
    return { score, isAnomaly: score > MlService.ANOMALY_THRESHOLD };
  }

  private zScore(value: number, stats: FeatureStats): number {
    if (stats.std < 0.001) return 0;
    return Math.abs((value - stats.mean) / stats.std);
  }

  private computeFeatureStats(
    features: Array<{ power: number; voltage: number; current: number; water_flow: number }>,
  ): Pick<ModelStats, 'power' | 'voltage' | 'current' | 'water_flow'> {
    const keys = ['power', 'voltage', 'current', 'water_flow'] as const;
    const result = {} as Record<typeof keys[number], FeatureStats>;
    for (const k of keys) {
      const vals = features.map(f => f[k]);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      result[k] = { mean, std: Math.sqrt(variance) };
    }
    return result;
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
}
