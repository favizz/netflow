import { IsIn, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class InitiateTopupDto {
  @IsString()
  @IsNotEmpty()
  unitNo!: string;

  @IsNumber()
  @Min(1000)
  amount!: number;

  @IsString()
  @IsIn(['qris', 'transfer', 'ewallet'])
  method!: 'qris' | 'transfer' | 'ewallet';
}
