// src/unit/entities/unit.entity.ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

// Helper agar angka desimal di DB terbaca sebagai Number di JS
class ColumnNumericTransformer {
  to(data: number): number { return data; }
  from(data: string): number { return parseFloat(data); }
}

@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  unit_no!: string;     // Contoh: "A-01"

  @Column({ unique: true })
  device_id!: string;   // Contoh: "ESP32-SIM-001"

  @Column('decimal', { 
    precision: 15, scale: 2, default: 0, 
    transformer: new ColumnNumericTransformer() 
  })
  balance!: number;     // Saldo Token (Rupiah)

  @Column({ default: true })
  relay_status!: boolean; // True = Nyala, False = Mati

  // --- Kolom untuk Logika Hitung Tagihan ---

  @Column('decimal', { 
    precision: 15, scale: 4, default: 0, 
    transformer: new ColumnNumericTransformer() 
  })
  last_energy_reading!: number; // Posisi kWh meter terakhir

  @Column('decimal', { 
    precision: 10, scale: 2, default: 1444.70, 
    transformer: new ColumnNumericTransformer() 
  })
  energy_tariff!: number;       // Harga per kWh
}