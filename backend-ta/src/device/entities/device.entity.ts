import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Property } from '../../unit/entities/property.entity';

@Entity('devices')
export class Device {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  device_id!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  unit_id!: string;

  @ManyToOne(() => Property)
  @JoinColumn({ name: 'unit_id' })
  property!: Property;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: true })
  serial_number!: string;

  @Column({ type: 'date', nullable: true })
  installation_date!: Date;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'boolean', nullable: true })
  relay_status!: boolean;

  @Column({ type: 'boolean', nullable: true })
  valve_status!: boolean;
}
