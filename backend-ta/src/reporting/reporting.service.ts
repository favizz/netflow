import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelemetryLog } from '../device/entities/telemetry-log.entity';
import { Property } from '../unit/entities/property.entity';
import { Device } from '../device/entities/device.entity';

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
    @InjectRepository(TelemetryLog)
    private readonly telemetryRepo: Repository<TelemetryLog>,
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
  ) {}

  async getConsumptionTrends(unitNo: string, period: 'daily' | 'monthly' = 'daily'): Promise<TrendPoint[]> {
    const property = await this.propertyRepo.findOne({ where: { unit_id: unitNo } });
    if (!property) throw new NotFoundException('Property not found');

    const device = await this.deviceRepo.findOne({ where: { unit_id: property.unit_id } });
    if (!device) return [];

    const rows = await this.telemetryRepo.find({
      where: { device_id: device.device_id },
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
      item.powerSum += Number(row.power_factor || 0); 
      item.flowSum += Number(row.debit_lpm || 0);
      item.count += 1;
      grouped.set(bucket, item);
    }

    const points = [...grouped.entries()].map(([bucket, v]) => {
      const avgPowerW = v.count > 0 ? v.powerSum / v.count : 0;
      const avgFlowLpm = v.count > 0 ? v.flowSum / v.count : 0;

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
