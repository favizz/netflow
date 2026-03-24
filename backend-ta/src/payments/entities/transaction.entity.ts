import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

class NumericTransformer {
  to(data: number | null): number | null { return data; }
  from(data: string | null): number | null {
    if (data === null || data === undefined) return null;
    return parseFloat(data);
  }
}

@Entity('transactions')
export class Transaction {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id!: string;

  @Column({ type: 'int' })
  unit_id!: number;

  @Column({ type: 'varchar', length: 50 })
  unit_no!: string;

  @Column('decimal', { precision: 12, scale: 2, transformer: new NumericTransformer() })
  amount_rp!: number;

  @Column({ type: 'enum', enum: ['qris', 'transfer', 'ewallet'] })
  method!: 'qris' | 'transfer' | 'ewallet';

  @Column({ type: 'enum', enum: ['pending', 'success', 'failed'], default: 'pending' })
  status!: 'pending' | 'success' | 'failed';

  @Column({ type: 'varchar', length: 100, nullable: true })
  gateway_reference!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  webhook_event_id!: string | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at!: Date;

  @Column({ type: 'datetime', nullable: true })
  confirmed_at!: Date | null;
}
