// src/device/entities/meter-reading.entity.ts
import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('meter_readings') // Nama tabel di PgAdmin tadi
export class MeterReading {
  
  @PrimaryColumn({ type: 'timestamptz' })
  time!: Date;

  @PrimaryColumn({ type: 'varchar' })
  device_id!: string;

  @Column('decimal', { nullable: true })
  voltage!: number;

  @Column('decimal', { nullable: true })
  current!: number;

  @Column('decimal', { nullable: true })
  power!: number;

  @Column('decimal', { nullable: true })
  water_flow!: number;

  // Kolom lain (energy_total, dll) bisa ditambah nanti
}