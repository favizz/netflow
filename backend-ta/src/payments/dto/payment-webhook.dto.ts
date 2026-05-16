import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PaymentWebhookDto {
  @IsString()
  @IsNotEmpty()
  order_id!: string;

  @IsString()
  @IsNotEmpty()
  transaction_status!: string;

  @IsString()
  @IsNotEmpty()
  status_code!: string;

  @IsString()
  @IsNotEmpty()
  gross_amount!: string;

  @IsString()
  @IsNotEmpty()
  signature_key!: string;

  @IsOptional()
  @IsString()
  transaction_id?: string;

  @IsOptional()
  @IsString()
  fraud_status?: string;

  @IsOptional()
  @IsString()
  payment_type?: string;
}
