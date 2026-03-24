import { IsEmail, IsNotEmpty } from 'class-validator';

export class DevLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
