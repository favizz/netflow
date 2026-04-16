import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { decodeTelemetry, encodeCommand } from '../common/binary-codec';
import { Unit } from '../unit/entities/unit.entity';
import { MeterReading } from './entities/device.entity';
import { AnomalyService } from '../anomaly/anomaly.service';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    private readonly dataSource: DataSource,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
    private readonly anomalyService: AnomalyService,
  ) {}

  async saveSensorData(payload: any) {
    // _deviceId injected by controller from the MQTT topic; fall back to payload field for legacy
    const deviceId: string | undefined = payload?._deviceId || payload?.dev_id || payload?.device_id;
    if (!deviceId) return;

    // Decode payload: custom 21-byte binary telemetry frame from firmware.
    // Falls back to plain object (e.g. unit-test injection) if not a Buffer.
    let data: Record<string, any>;
    if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
      const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      if (buf.length < 21) return; // malformed frame
      data = decodeTelemetry(buf) as Record<string, any>;
    } else if (typeof payload === 'object' && payload !== null) {
      data = payload as Record<string, any>;
    } else {
      return;
    }

    const incomingEnergyTotal = Number(data.et || 0);
    const incomingWaterTotal  = Number(data.wt || 0);
    const voltage  = this.toNumber(data.v);
    const current  = this.toNumber(data.c);
    const power    = this.toNumber(data.p);
    const waterFlow = this.toNumber(data.wf);
    const incomingBalance = data.b !== undefined ? Number(data.b) : null;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedUnit: Unit | null = null;

    try {
      const unit = await queryRunner.manager.findOne(Unit, {
        where: { device_id: deviceId },
        lock: { mode: 'pessimistic_write' },
      });

      if (unit) {
        let deltaEnergy = 0;
        if (incomingEnergyTotal > Number(unit.last_energy_reading)) {
          deltaEnergy = incomingEnergyTotal - Number(unit.last_energy_reading);
        }

        let deltaWater = 0;
        if (incomingWaterTotal > Number(unit.last_water_reading)) {
          deltaWater = incomingWaterTotal - Number(unit.last_water_reading);
        }

        const cost = (deltaEnergy * Number(unit.energy_tariff)) + (deltaWater * Number(unit.water_tariff));

        if (cost > 0) {
          unit.balance = Number(unit.balance) - cost;
          unit.last_energy_reading = incomingEnergyTotal;
          unit.last_water_reading = incomingWaterTotal;

          if (Number(unit.balance) <= 0) {
            unit.balance = 0;
            if (unit.relay_status) {
              unit.relay_status = false;
              this.mqttClient.emit(`device/${deviceId}/command`, encodeCommand('relay', 0));
            }
            if (unit.valve_status) {
              unit.valve_status = false;
              this.mqttClient.emit(`device/${deviceId}/command`, encodeCommand('valve', 0));
            }
          }
        }

        // --- HYBRID EDGE SECURITY AUDIT ---
        // If the IoT device sent its local balance, cross-check it with our secure Server balance
        if (incomingBalance !== null) {
          const cloudBalance = Number(unit.balance);
          const diff = Math.abs(cloudBalance - incomingBalance);
          
          if (diff > 500) { 
            // If the device balance deviates by more than Rp 500, it might be hacked or lost sync
            console.warn(`[SECURITY] 🚨 Mismatch on ${deviceId}! Edge: Rp ${incomingBalance} | Cloud: Rp ${cloudBalance}`);
          } else {
            // If it's just minor float rounding differences, gently snap the server to the device's math
            unit.balance = incomingBalance;
          }
        }

        await queryRunner.manager.save(unit);

        savedUnit = unit;

        // Only store telemetry for known registered devices
        const row = queryRunner.manager.create(MeterReading, {
          time: new Date(),
          device_id: deviceId,
          voltage,
          current,
          power,
          water_flow: waterFlow,
          energy_total: incomingEnergyTotal || null,
          water_total: incomingWaterTotal || null,
        });
        await queryRunner.manager.save(row);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Run anomaly checks after transaction commits — non-blocking
    if (savedUnit) {
      void this.anomalyService
        .checkOnTelemetry(
          deviceId,
          savedUnit.unit_no,
          power,
          waterFlow,
          voltage,
          Number(savedUnit.balance),
          savedUnit.relay_status,
        )
        .catch(() => {
          // Anomaly check failures must not affect telemetry ingestion
        });
    }
  }

  private toNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
