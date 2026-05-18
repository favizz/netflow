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

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 4.55 })
  flowrate_factor!: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 1.05 })
  power_factor!: number;

  @Column({ type: 'tinyint', default: 5 })
  sampling_time!: number;

  @UpdateDateColumn()
  updated_at!: Date;
}
