import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('auth_refresh_tokens')
export class AuthRefreshToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', unique: true })
  token_hash!: string;

  @Column({ type: 'varchar' })
  user_sub!: string; // resident email

  @Column({ type: 'enum', enum: ['mobile', 'admin'], default: 'mobile' })
  source!: 'mobile' | 'admin';

  @Column({ type: 'datetime' })
  expires_at!: Date;

  @Column({ type: 'datetime', nullable: true })
  revoked_at!: Date | null;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;
}
