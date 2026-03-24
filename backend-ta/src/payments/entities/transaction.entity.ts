<<<<<<< HEAD
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
=======
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../admin/entities/user.entity';
import { Device } from '../../device/entities/device.entity';
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6

class NumericTransformer {
  to(data: number | null): number | null { return data; }
  from(data: string | null): number | null {
    if (data === null || data === undefined) return null;
    return parseFloat(data);
  }
}

@Entity('transactions')
export class Transaction {
<<<<<<< HEAD
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
=======
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
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
}
