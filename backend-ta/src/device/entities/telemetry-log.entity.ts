import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Device } from './device.entity';

@Entity('telemetry_logs')
export class TelemetryLog {
  @PrimaryColumn({ type: 'timestamptz' })
  time!: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  device_id!: string;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device!: Device;

  @Column({ type: 'varchar', length: 20, nullable: true })
  utility_type!: string;

  @Column({ type: 'double precision', nullable: true })
  energy_total_kwh!: number;

  @Column({ type: 'double precision', nullable: true })
  day_kwh!: number;

  @Column({ type: 'double precision', nullable: true })
  tegangan_v!: number;

  @Column({ type: 'double precision', nullable: true })
  arus_a!: number;

  @Column({ type: 'double precision', nullable: true })
  frekuensi_hz!: number;

  @Column({ type: 'double precision', nullable: true })
  power_factor!: number;

  @Column({ type: 'double precision', nullable: true })
  token_kwh!: number;

  @Column({ type: 'double precision', nullable: true })
  token_m3!: number;

  @Column({ type: 'double precision', nullable: true })
  volume_total_m3!: number;

  @Column({ type: 'double precision', nullable: true })
  debit_lpm!: number;

  @Column({ type: 'boolean', nullable: true })
  status_relay!: boolean;

  @Column({ type: 'boolean', nullable: true })
  status_valve!: boolean;
}
