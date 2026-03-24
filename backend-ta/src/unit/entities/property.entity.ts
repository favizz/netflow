import { Entity, Column, PrimaryColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../admin/entities/user.entity';

@Entity('properties')
export class Property {
  @PrimaryColumn({ type: 'varchar', length: 10 })
  unit_id!: string;

  @Column({ type: 'uuid', nullable: true })
  user_id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 20, nullable: true })
  location_floor!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  status!: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;
}
