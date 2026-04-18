import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

class NumericTransformer {
  to(data: number): number { return data; }
  from(data: string): number { return parseFloat(data); }
}

@Entity('tariffs')
export class Tariff {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'enum', enum: ['electricity', 'water'] })
  utility_type!: 'electricity' | 'water';

  @Column('decimal', { precision: 10, scale: 4, transformer: new NumericTransformer() })
  price_per_unit!: number;

  @Column({ type: 'date' })
  effective_date!: string;

  @CreateDateColumn({ type: 'datetime' })
  created_at!: Date;
}
