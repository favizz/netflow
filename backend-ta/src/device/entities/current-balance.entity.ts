import { Entity, Column, PrimaryColumn, OneToOne, JoinColumn } from 'typeorm';
import { Device } from './device.entity';

class NumericTransformer {
  to(data: number | null): number | null { return data; }
  from(data: string | null): number | null {
    if (data === null || data === undefined) return null;
    return parseFloat(data);
  }
}

@Entity('current_balance')
export class CurrentBalance {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  device_id!: string;

  @OneToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device!: Device;

  @Column('numeric', { precision: 12, scale: 3, nullable: true, transformer: new NumericTransformer() })
  current_kwh!: number | null;

  @Column('numeric', { precision: 12, scale: 3, nullable: true, transformer: new NumericTransformer() })
  current_m3!: number | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  last_updated_at!: Date;
}
