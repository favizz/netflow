import { IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]-\d{4}$/, { message: 'unit_no must follow format A-2401' })
  unit_no!: string;

  @IsString()
  @IsNotEmpty()
  device_id!: string;

  @IsOptional()
  @Min(0)
  balance?: number;

  @IsOptional()
  @Min(0)
  energy_tariff?: number;
}
