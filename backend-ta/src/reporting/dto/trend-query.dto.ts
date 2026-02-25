import { IsIn, IsOptional } from 'class-validator';

export class TrendQueryDto {
  @IsOptional()
  @IsIn(['daily', 'monthly'])
  period?: 'daily' | 'monthly';
}
