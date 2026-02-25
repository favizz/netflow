// src/device/device.service.ts
import { Injectable, Inject } from '@nestjs/common'; // Tambah Inject
import { ClientProxy } from '@nestjs/microservices'; // Tambah ClientProxy
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MeterReading } from './entities/device.entity';
import { Unit } from '../unit/entities/unit.entity';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(MeterReading)
    private meterRepo: Repository<MeterReading>,
    @InjectRepository(Unit)
    private unitRepo: Repository<Unit>,
    private dataSource: DataSource,
    
    // INJEKSI CLIENT MQTT DI SINI
    @Inject('MQTT_CLIENT') private mqttClient: ClientProxy,
  ) {}

  async saveSensorData(data: any) {
    // ... (Kode parsing data sebelumnya tetap sama) ...
    // Pastikan variabel incomingEnergyTotal sudah ada
    const incomingEnergyTotal = parseFloat(data.et) || 0; 

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // A. Ambil Data Unit (Lock row agar aman dari race condition)
      const unit = await queryRunner.manager.findOne(Unit, { 
        where: { device_id: data.dev_id },
        lock: { mode: 'pessimistic_write' } // Cegah double update
      });

      if (!unit) return;

      // B. Hitung Delta & Biaya
      let deltaEnergy = 0;
      if (incomingEnergyTotal > unit.last_energy_reading) {
        deltaEnergy = incomingEnergyTotal - unit.last_energy_reading;
      }
      const cost = deltaEnergy * unit.energy_tariff;

      // C. Update Saldo
      if (cost > 0) {
        unit.balance -= cost;
        unit.last_energy_reading = incomingEnergyTotal;

        // --- LOGIKA AUTO-CUTOFF ---
        // Jika saldo <= 0 DAN relay masih nyala, Matikan!
        if (unit.balance <= 0 && unit.relay_status === true) {
            
            // 1. Update status di DB
            unit.relay_status = false;
            
            // 2. Kirim Perintah ke Alat via MQTT
            // Topik: device/{ID}/cmd
            // Pesan: { "relay": "OFF" }
            this.mqttClient.emit(`device/${data.dev_id}/cmd`, { 
                relay: 'OFF',
                reason: 'NO_BALANCE'
            });
            
            console.log(`[CUTOFF] Mematikan listrik unit ${unit.unit_no}!`);
        }
        // --------------------------

        await queryRunner.manager.save(unit);
      }

      // D. Simpan Log (Sama seperti sebelumnya)
      const newLog = this.meterRepo.create({
        time: new Date(),
        device_id: data.dev_id,
        voltage: parseFloat(data.v),
        current: parseFloat(data.i),
        power: parseFloat(data.p),
        energy_total: incomingEnergyTotal, 
      });
      await queryRunner.manager.save(newLog);

      await queryRunner.commitTransaction();
      // console.log(`Saldo: ${unit.balance}`); // Uncomment untuk debug

    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error(err);
    } finally {
      await queryRunner.release();
    }
  }
}