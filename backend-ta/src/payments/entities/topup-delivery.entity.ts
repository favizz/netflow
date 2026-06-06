import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

class NumericTransformer {
  to(data: number | null): number | null {
    return data;
  }
  from(data: string | null): number | null {
    if (data === null || data === undefined) return null;
    return parseFloat(data);
  }
}

export type TopupDeliveryStatus =
  | 'pending'
  | 'sent'
  | 'acked'
  | 'confirmed'
  | 'failed';

@Entity('topup_deliveries')
@Index(['transaction_id'], { unique: true })
@Index(['device_id', 'status'])
export class TopupDelivery {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  transaction_id!: string;

  @Column({ type: 'varchar', length: 50 })
  unit_no!: string;

  @Column({ type: 'varchar', length: 100 })
  device_id!: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new NumericTransformer(),
  })
  electricity_amount_rp!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new NumericTransformer(),
  })
  water_amount_rp!: number;

  @Column({
    type: 'enum',
    enum: ['pending', 'sent', 'acked', 'confirmed', 'failed'],
    default: 'pending',
  })
  status!: TopupDeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attempt_count!: number;

  @Column({ type: 'int', nullable: true })
  command_timestamp!: number | null;

  @Column({ type: 'json', nullable: true })
  payload_json!: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  ack_json!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  last_error!: string | null;

  @Column({ type: 'datetime', nullable: true })
  sent_at!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  acked_at!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  confirmed_at!: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at!: Date;
}
