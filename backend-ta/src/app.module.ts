// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DeviceModule } from './device/device.module'; // Kita akan buat ini nanti
import { UnitModule } from './unit/unit.module';

@Module({
  imports: [
    // 1. Load Environment Variables
    ConfigModule.forRoot({ isGlobal: true }),

    // 2. Koneksi Database
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5433,            // <--- PENTING: Pakai port 5433 (sesuai docker-compose solusi 1)
      username: 'admin',
      password: 'passwordTA2026',
      database: 'iot_system',
      autoLoadEntities: true,
      synchronize: false,    // FALSE karena kita sudah bikin tabel manual di PgAdmin. Aman.
    }),

    // 3. Module Fitur Utama
    DeviceModule,

    UnitModule,
  ],
})
export class AppModule {}