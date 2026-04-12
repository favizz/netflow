import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('anomalies')
export class Anomaly {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  device_id!: string;

  @Column()
  type!: string;

  @Column()
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
