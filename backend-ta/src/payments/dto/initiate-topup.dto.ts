import { IsIn, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class InitiateTopupDto {
  @IsString()
  @IsNotEmpty()
  unitNo!: string;

  /** Rp amount credited to the electricity sub-balance. May be 0. */
  @IsNumber()
  @Min(0)
  electricityAmount!: number;

  /** Rp amount credited to the water sub-balance. May be 0. */
  @IsNumber()
  @Min(0)
  waterAmount!: number;

  @IsString()
  @IsIn(['qris', 'transfer', 'ewallet'])
  method!: 'qris' | 'transfer' | 'ewallet';
}
