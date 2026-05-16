import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('calibration_settings')
export class CalibrationSetting {
  @PrimaryGeneratedColumn()
  id!: number;

  /** NULL = global default applied to all devices without a per-device override. */
  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  device_id!: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 4.55 })
  flowrate_factor!: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 1.05 })
  power_factor!: number;

  @Column({ type: 'tinyint', default: 5 })
  sampling_time!: number;

  @UpdateDateColumn()
  updated_at!: Date;
}
