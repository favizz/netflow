import { Entity, Column, PrimaryColumn } from 'typeorm';

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
  @PrimaryColumn({ type: 'timestamptz' })
  time!: Date;

  @PrimaryColumn({ type: 'varchar' })
  device_id!: string;

  @Column('decimal', { nullable: true, transformer: new NumericTransformer() })
  voltage!: number | null;

  @Column('decimal', { nullable: true, transformer: new NumericTransformer() })
  current!: number | null;

  @Column('decimal', { nullable: true, transformer: new NumericTransformer() })
  power!: number | null;

  @Column('decimal', { nullable: true, transformer: new NumericTransformer() })
  water_flow!: number | null;

  @Column('decimal', { nullable: true, transformer: new NumericTransformer() })
  energy_total!: number | null;
}
