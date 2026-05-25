import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Index(['device_id', 'resolved_at', 'type'])
@Entity('anomalies')
export class Anomaly {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  device_id!: string;

  @Column({ type: 'varchar', length: 50 })
  type!: string;

  @Column({ type: 'varchar', length: 20 })
  severity!: string;

  @Column('text')
  description!: string;

  @Column('text', { nullable: true })
  action_taken!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @Column({ type: 'datetime', nullable: true })
  resolved_at!: Date | null;
}
