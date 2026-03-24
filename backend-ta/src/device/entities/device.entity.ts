import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Property } from '../../unit/entities/property.entity';

<<<<<<< HEAD
class NumericTransformer {
  to(data: number | null): number | null {
    return data;
  }

  from(data: string | null): number | null {
    if (data === null || data === undefined) {
      return null;
    }
    return parseFloat(data);
  }
}

@Entity('meter_readings')
export class MeterReading {
  @PrimaryColumn({ type: 'datetime' })
  time!: Date;

  @PrimaryColumn({ type: 'varchar' })
=======
@Entity('devices')
export class Device {
  @PrimaryColumn({ type: 'varchar', length: 50 })
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
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
