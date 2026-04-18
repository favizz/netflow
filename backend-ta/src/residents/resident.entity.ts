import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('residents')
export class Resident {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  google_id!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'text', nullable: true })
  picture!: string | null;

  @Column({ type: 'enum', enum: ['resident', 'admin'], default: 'resident' })
  role!: 'resident' | 'admin';

  @CreateDateColumn({ type: 'datetime' })
  created_at!: Date;
}
