import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  Min,
} from 'class-validator';

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  unit_no!: string;

  @IsString()
  @IsNotEmpty()
  device_id!: string;

  @IsOptional()
  @Min(0)
  balance?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  building_id?: number;
}
