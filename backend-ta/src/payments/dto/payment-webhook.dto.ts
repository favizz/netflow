import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator';

export class PaymentWebhookDto {
  @IsString()
  @IsNotEmpty()
  transactionId!: string;

  @IsString()
  @IsIn(['success', 'failed'])
  status!: 'success' | 'failed';

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'timestamp must be unix epoch milliseconds' })
  timestamp!: string;

  @IsString()
  @IsNotEmpty()
  signature!: string;
}
