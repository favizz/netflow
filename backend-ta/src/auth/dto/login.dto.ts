import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]-\d{4}$/, { message: 'unitNo must follow format A-2401' })
  unitNo!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  pin!: string;
}
