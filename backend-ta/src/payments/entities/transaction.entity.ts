import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../admin/entities/user.entity';
import { Device } from '../../device/entities/device.entity';

class NumericTransformer {
  to(data: number | null): number | null { return data; }
  from(data: string | null): number | null {
    if (data === null || data === undefined) return null;
    return parseFloat(data);
  }
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  transaction_id!: string;

  @Column({ type: 'uuid', nullable: true })
  user_id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 50, nullable: true })
  device_id!: string;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device!: Device;

  @Column('numeric', { precision: 12, scale: 2, nullable: true, transformer: new NumericTransformer() })
  amount_rp!: number | null;

  @Column('numeric', { precision: 12, scale: 3, nullable: true, transformer: new NumericTransformer() })
  amount_utility!: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  token_code!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  utility_type!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  status!: string;

  @CreateDateColumn({ type: 'timestamp' })
  transaction_date!: Date;
}
