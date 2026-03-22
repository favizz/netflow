import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('auth_refresh_tokens')
export class AuthRefreshToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', unique: true })
  token_hash!: string;

  @Column({ type: 'varchar' })
  user_sub!: string; // UUID of User

  @Column({ type: 'varchar' })
  username!: string;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  created_at!: Date;
}
