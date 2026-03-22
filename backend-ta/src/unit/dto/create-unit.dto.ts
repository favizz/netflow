import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  unit_id!: string;

  @IsString()
  @IsOptional()
  user_id?: string;

  @IsString()
  @IsOptional()
  location_floor?: string;

  @IsString()
  @IsOptional()
  status?: string;

  // We optionally accept a device_id to assign it immediately during creation
  @IsString()
  @IsOptional()
  device_id?: string;
}
