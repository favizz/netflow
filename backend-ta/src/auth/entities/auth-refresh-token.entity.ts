import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('auth_refresh_tokens')
export class AuthRefreshToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', unique: true })
  token_hash!: string;

<<<<<<< HEAD
  @Column({ type: 'varchar' })
  user_sub!: string;  // resident email
=======
  @Column({ type: 'varchar' })
  user_sub!: string; // UUID of User

  @Column({ type: 'varchar' })
  username!: string;
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6

  @Column({ type: 'varchar', nullable: true })
  unit_no!: string | null;

  @Column({ type: 'int', nullable: true })
  unit_id!: number | null;

  @Column({ type: 'datetime' })
  expires_at!: Date;

  @Column({ type: 'datetime', nullable: true })
  revoked_at!: Date | null;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;
}
