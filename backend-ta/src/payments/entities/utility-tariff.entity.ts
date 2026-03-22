import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

class NumericTransformer {
  to(data: number | null): number | null { return data; }
  from(data: string | null): number | null {
    if (data === null || data === undefined) return null;
    return parseFloat(data);
  }
}

@Entity('utility_tariff')
export class UtilityTariff {
  @PrimaryGeneratedColumn()
  tariff_id!: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  utility_type!: string;

  @Column('numeric', { precision: 10, scale: 4, nullable: true, transformer: new NumericTransformer() })
  price_per_unit!: number | null;

  @Column({ type: 'date', nullable: true })
  effective_date!: Date;
}
