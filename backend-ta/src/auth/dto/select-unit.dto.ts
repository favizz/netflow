import { IsInt, IsPositive } from 'class-validator';

export class SelectUnitDto {
  @IsInt()
  @IsPositive()
  unitId!: number;
}
