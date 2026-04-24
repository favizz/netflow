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
  score: number;    // Isolation Forest anomaly score [0, 1]. Higher = more anomalous.
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
    // Probe ML service on startup
    await this.checkMlAvailability();

    const intervalSec = this.cfg.get<number>('ML_SCORING_INTERVAL_SECONDS', 300);
    if (intervalSec > 0 && this.mlAvailable) {
      setInterval(() => void this.scoreAllUnits(), intervalSec * 1_000);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async getAnomalyScore(deviceId: string): Promise<AnomalyScore | null> {
    if (this.scoreCache.has(deviceId)) return this.scoreCache.get(deviceId)!;
    return this.scoreUnit(deviceId);
  }

  async getAllScores(): Promise<AnomalyScore[]> {
    return [...this.scoreCache.values()];
  }

  async getDepletionForecast(unitNo: string): Promise<DepletionForecast> {
    const unit = await this.unitService.findByUnitNo(unitNo);
    const [elecTariff, waterTariff] = await Promise.all([
      this.tariffService.findCurrent('electricity'),
      this.tariffService.findCurrent('water'),
    ]);

    // Get 7-day average consumption from DB
    const stats = await this.get7DayStats(unit.device_id);

    const dailyCostRp = (stats.avgDailyKwh * elecTariff) + (stats.avgDailyM3 * waterTariff);
    const balance = Number(unit.balance);

    let estimatedDaysRemaining = 0;
    let confidence: DepletionForecast['confidence'] = 'low';

    if (dailyCostRp > 0) {
      estimatedDaysRemaining = balance / dailyCostRp;
      confidence = stats.readingDays >= 7 ? 'high' : stats.readingDays >= 3 ? 'medium' : 'low';
    }

    // Optionally refine via ML service
    if (this.mlAvailable) {
      try {
        const { data } = await firstValueFrom(
          this.http.post<{ days_remaining: number }>('/predict/depletion', {
            balance_rp: balance,
            avg_daily_kwh: stats.avgDailyKwh,
            avg_daily_m3: stats.avgDailyM3,
            tariff_elec: elecTariff,
            tariff_water: waterTariff,
          }),
        );
        estimatedDaysRemaining = data.days_remaining;
        confidence = 'high';
      } catch {
        // ML service call failed — use rule-based estimate
      }
    }

    return {
      unitNo,
      balanceRp: balance,
      estimatedDaysRemaining: parseFloat(estimatedDaysRemaining.toFixed(1)),
      avgDailyKwh: parseFloat(stats.avgDailyKwh.toFixed(3)),
      avgDailyM3:  parseFloat(stats.avgDailyM3.toFixed(3)),
      dailyCostRp: parseFloat(dailyCostRp.toFixed(2)),
      confidence,
      forecastAt: new Date().toISOString(),
    };
  }

  // ── Batch scoring ──────────────────────────────────────────────────────────

  async scoreAllUnits(): Promise<void> {
    try {
      const units = await this.unitRepo.find();
      await Promise.all(units.map(u => this.scoreUnit(u.device_id).catch(() => null)));
    } catch (err) {
      this.logger.warn(`Batch ML scoring failed: ${(err as Error).message}`);
    }
  }

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
        power:      r.power ?? 0,
        voltage:    r.voltage ?? 220,
        current:    r.current ?? 0,
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
    const rows: Array<{ day: string; kwh: string; m3: string; cnt: string }> = await this.meterRepo.query(
      `SELECT DATE_FORMAT(time, '%Y-%m-%d') AS day,
              GREATEST(0, MAX(energy_total) - MIN(energy_total)) AS kwh,
              GREATEST(0, MAX(water_total)  - MIN(water_total))  AS m3,
              COUNT(*) AS cnt
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
      this.logger.log(`ML service reachable at ${this.cfg.get('ML_SERVICE_URL', 'http://localhost:8000')}`);
    } catch {
      this.mlAvailable = false;
      this.logger.warn('ML service not reachable — rule-based anomaly detection only.');
    }
  }
}
