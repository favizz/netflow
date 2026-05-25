import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeterReading } from '../device/entities/device.entity';
import { Unit } from '../admin/unit/entities/unit.entity';

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

    // Fetch one extra period so the LAG() for the first row in the window has a
    // valid previous value. Without this, the first bucket always shows delta=0.
    const fetchInterval =
      period === 'daily'
        ? `DATE_SUB(NOW(), INTERVAL 31 DAY)`
        : `DATE_SUB(NOW(), INTERVAL 13 MONTH)`;

    const windowStart =
      period === 'daily'
        ? `DATE_SUB(NOW(), INTERVAL 30 DAY)`
        : `DATE_SUB(NOW(), INTERVAL 12 MONTH)`;

    // Use LAG() to compute per-row deltas. GREATEST(0, delta) discards sensor-reset
    // rows where energy_total or water_total drops, so the aggregated consumption
    // is correct even when the sensor counter resets mid-period.
    const rows: Array<{
      bucket: string;
      kwh: string;
      water_m3: string;
      avg_power: string;
      avg_flow: string;
      cnt: string;
    }> = await this.meterRepo.query(
      `SELECT
         sub.bucket                              AS bucket,
         SUM(GREATEST(0, sub.energy_delta))      AS kwh,
         SUM(GREATEST(0, sub.water_delta))       AS water_m3,
         AVG(sub.power)                          AS avg_power,
         AVG(sub.water_flow)                     AS avg_flow,
         COUNT(*)                                AS cnt
       FROM (
         SELECT
           ${bucketExpr}                                                          AS bucket,
           time,
           COALESCE(energy_total, 0)
             - LAG(COALESCE(energy_total, 0), 1, COALESCE(energy_total, 0))
               OVER (ORDER BY time)                                               AS energy_delta,
           COALESCE(water_total, 0)
             - LAG(COALESCE(water_total, 0), 1, COALESCE(water_total, 0))
               OVER (ORDER BY time)                                               AS water_delta,
           power,
           water_flow
         FROM meter_readings
         WHERE device_id = ?
           AND time >= ${fetchInterval}
       ) sub
       WHERE sub.time >= ${windowStart}
       GROUP BY sub.bucket
       ORDER BY sub.bucket ASC
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
