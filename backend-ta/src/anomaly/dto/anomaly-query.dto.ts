import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import type { AnomalyType, AnomalySeverity } from '../anomaly.types';

export class AnomalyQueryDto {
  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsEnum([
    'jailbreak',
    'water_leak',
    'device_offline',
    'mcb_trip',
    'low_electricity_token',
    'low_water_token',
    'voltage_anomaly',
    'sensor_malfunction',
    'low_power_factor',
    'usage_spike',
    'zero_flow',
    'backflow',
  ])
  type?: AnomalyType;

  @IsOptional()
  @IsEnum(['critical', 'warning'])
  severity?: AnomalySeverity;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
