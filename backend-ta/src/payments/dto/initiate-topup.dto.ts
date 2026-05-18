import { IsIn, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class InitiateTopupDto {
  @IsString()
  @IsNotEmpty()
  unitNo!: string;

  /** Rp amount allocated for electricity tokens. May be 0. */
  @IsNumber()
  @Min(0)
  electricityAmount!: number;

  /** Rp amount allocated for water tokens. May be 0. */
  @IsNumber()
  @Min(0)
  waterAmount!: number;

  @IsString()
  @IsIn(['qris', 'transfer', 'ewallet'])
  method!: 'qris' | 'transfer' | 'ewallet';
}
