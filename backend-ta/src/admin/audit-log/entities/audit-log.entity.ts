import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  actor!: string;

  @Column({ type: 'varchar', length: 50 })
  action!: string;

  @Column({ type: 'varchar', length: 100 })
  target_type!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  target!: string | null;

  @Column({ type: 'text', nullable: true })
  details!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'success' })
  result!: 'success' | 'failure' | 'info';

  @CreateDateColumn({ type: 'datetime' })
  created_at!: Date;
}
