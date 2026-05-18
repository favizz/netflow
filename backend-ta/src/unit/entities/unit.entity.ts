import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

class NumericTransformer {
  to(data: number): number {
    return data;
  }
  from(data: string): number {
    return parseFloat(data);
  }
}

@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ default: 1 })
  building_id!: number;

  @Column({ unique: true })
  unit_no!: string;

  @Column({ unique: true, nullable: true })
  device_id!: string | null;

  @Column({ type: 'varchar', nullable: true })
  resident_email!: string | null;

  @Column('decimal', {
    precision: 15,
    scale: 4,
    default: 0,
    transformer: new NumericTransformer(),
  })
  token_electricity!: number;

  @Column('decimal', {
    precision: 15,
    scale: 4,
    default: 0,
    transformer: new NumericTransformer(),
  })
  token_water!: number;

  @Column({ default: true })
  relay_status!: boolean;

  @Column({ default: true })
  valve_status!: boolean;

  @Column('decimal', {
    precision: 15,
    scale: 4,
    default: 0,
    transformer: new NumericTransformer(),
  })
  last_energy_reading!: number;

  @Column('decimal', {
    precision: 15,
    scale: 4,
    default: 0,
    transformer: new NumericTransformer(),
  })
  last_water_reading!: number;

  @CreateDateColumn()
  created_at!: Date;
}
