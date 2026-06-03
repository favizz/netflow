import { IsNotEmpty, IsNumber, IsOptional, IsString, IsInt, Min } from 'class-validator';

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  unit_no!: string;

  @IsString()
  @IsNotEmpty()
  device_id!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  token_electricity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  token_water?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  building_id?: number;
}
