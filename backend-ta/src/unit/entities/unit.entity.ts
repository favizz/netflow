import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

class ColumnNumericTransformer {
  to(data: number): number { return data; }
  from(data: string): number { return parseFloat(data); }
}

@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  unit_no!: string;

  @Column({ unique: true })
  device_id!: string;

  @Column('decimal', {
    precision: 15, scale: 2, default: 0,
    transformer: new ColumnNumericTransformer()
  })
  balance!: number;

  @Column({ default: true })
  relay_status!: boolean;

  @Column({ default: true })
  valve_status!: boolean;

  @Column('decimal', {
    precision: 15, scale: 4, default: 0,
    transformer: new ColumnNumericTransformer()
  })
  last_energy_reading!: number;

  @Column('decimal', {
    precision: 15, scale: 4, default: 0,
    transformer: new ColumnNumericTransformer()
  })
  last_water_reading!: number;

  @Column({ type: 'varchar', nullable: true })
  resident_email!: string | null;
}
