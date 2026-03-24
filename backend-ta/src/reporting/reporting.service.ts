import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeterReading } from '../device/entities/device.entity';
import { Unit } from '../unit/entities/unit.entity';

export interface TrendPoint {
  bucket: string;
  kwh: number;
  waterM3: number;
  avgPowerW: number;
  avgFlowLpm: number;
}

@Injectable()
export class ReportingService {
  constructor(
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
  ) {}

  async getConsumptionTrends(unitNo: string, period: 'daily' | 'monthly' = 'daily'): Promise<TrendPoint[]> {
    const unit = await this.unitRepo.findOne({ where: { unit_no: unitNo } });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    const rows = await this.meterRepo.find({
      where: { device_id: unit.device_id },
      order: { time: 'ASC' },
      take: 5000,
    });

    const grouped = new Map<string, { powerSum: number; flowSum: number; count: number }>();

    for (const row of rows) {
      const date = new Date(row.time);
      const bucket =
        period === 'daily'
          ? date.toISOString().slice(0, 10)
          : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

      const item = grouped.get(bucket) || { powerSum: 0, flowSum: 0, count: 0 };
      item.powerSum += Number(row.power || 0);
      item.flowSum += Number(row.water_flow || 0);
      item.count += 1;
      grouped.set(bucket, item);
    }

    const points = [...grouped.entries()].map(([bucket, v]) => {
      const avgPowerW = v.count > 0 ? v.powerSum / v.count : 0;
      const avgFlowLpm = v.count > 0 ? v.flowSum / v.count : 0;

      // Approximation for client trend visuals. Actual billing must use server token engine.
      const kwh = Number(((avgPowerW / 1000) * 24).toFixed(3));
      const waterM3 = Number(((avgFlowLpm * 60 * 24) / 1000).toFixed(3));

      return {
        bucket,
        kwh,
        waterM3,
        avgPowerW: Number(avgPowerW.toFixed(2)),
        avgFlowLpm: Number(avgFlowLpm.toFixed(2)),
      };
    });

    return points.sort((a, b) => a.bucket.localeCompare(b.bucket)).slice(-30);
  }
}
