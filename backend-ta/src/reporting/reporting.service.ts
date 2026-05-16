import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeterReading } from '../device/entities/device.entity';
import { Unit } from '../unit/entities/unit.entity';

export interface TrendPoint {
  bucket: string;
  kwh: number; // Actual energy consumed = MAX(energy_total) – MIN(energy_total) per period
  waterM3: number; // Actual water consumed  = MAX(water_total)  – MIN(water_total)  per period
  avgPowerW: number; // Average active power for display only (not used in billing)
  avgFlowLpm: number;
  readingCount: number;
}

@Injectable()
export class ReportingService {
  constructor(
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
  ) {}

  async getConsumptionTrends(
    unitNo: string,
    period: 'daily' | 'monthly' = 'daily',
  ): Promise<TrendPoint[]> {
    const unit = await this.unitRepo.findOne({ where: { unit_no: unitNo } });
    if (!unit) throw new NotFoundException('Unit not found');

    const bucketExpr =
      period === 'daily'
        ? `DATE_FORMAT(time, '%Y-%m-%d')`
        : `DATE_FORMAT(time, '%Y-%m')`;

    const intervalExpr =
      period === 'daily'
        ? `DATE_SUB(NOW(), INTERVAL 30 DAY)`
        : `DATE_SUB(NOW(), INTERVAL 12 MONTH)`;

    // Single aggregation query - partition elimination applies automatically.
    // Energy delta (MAX – MIN) is the physically correct consumption per period.
    const rows: Array<{
      bucket: string;
      kwh: string;
      water_m3: string;
      avg_power: string;
      avg_flow: string;
      cnt: string;
    }> = await this.meterRepo.query(
      `SELECT
         ${bucketExpr}                                                                    AS bucket,
         GREATEST(0, COALESCE(MAX(energy_total), 0) - COALESCE(MIN(energy_total), 0))  AS kwh,
         GREATEST(0, COALESCE(MAX(water_total),  0) - COALESCE(MIN(water_total),  0))  AS water_m3,
         AVG(power)                                                                     AS avg_power,
         AVG(water_flow)                                                                AS avg_flow,
         COUNT(*)                                                                       AS cnt
       FROM meter_readings
       WHERE device_id = ?
         AND time >= ${intervalExpr}
       GROUP BY ${bucketExpr}
       ORDER BY bucket ASC
       LIMIT 30`,
      [unit.device_id],
    );

    return rows.map((r) => ({
      bucket: r.bucket,
      kwh: parseFloat(parseFloat(r.kwh ?? '0').toFixed(3)),
      waterM3: parseFloat(parseFloat(r.water_m3 ?? '0').toFixed(3)),
      avgPowerW: parseFloat(parseFloat(r.avg_power ?? '0').toFixed(2)),
      avgFlowLpm: parseFloat(parseFloat(r.avg_flow ?? '0').toFixed(2)),
      readingCount: parseInt(r.cnt ?? '0', 10),
    }));
  }
}
