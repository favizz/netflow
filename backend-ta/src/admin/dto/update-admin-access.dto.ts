import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateAdminAccessDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['viewer', 'operator', 'super-admin'])
  role?: 'viewer' | 'operator' | 'super-admin';
}
