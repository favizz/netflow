import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    const deviceId = payload?.dev_id || payload?.device_id;
    if (!deviceId) {
      return;
    }

    const incomingEnergyTotal = Number(payload?.et || payload?.energy_total || 0);
    const voltage = this.toNumber(payload?.v);
    const current = this.toNumber(payload?.i);
    const power = this.toNumber(payload?.p);
    const waterFlow = this.toNumber(payload?.wf || payload?.water_flow);

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

        const cost = deltaEnergy * Number(unit.energy_tariff);

        if (cost > 0) {
          unit.balance = Number(unit.balance) - cost;
          unit.last_energy_reading = incomingEnergyTotal;

          if (Number(unit.balance) <= 0 && unit.relay_status) {
            unit.balance = 0;
            unit.relay_status = false;
            this.mqttClient.emit(`device/${deviceId}/cmd`, { relay: 'OFF', reason: 'NO_BALANCE' });
          }

          await queryRunner.manager.save(unit);
        }

        savedUnit = unit;
      }

      const row = queryRunner.manager.create(MeterReading, {
        time: new Date(),
        device_id: deviceId,
        voltage,
        current,
        power,
        water_flow: waterFlow,
        energy_total: incomingEnergyTotal || null,
      });
      await queryRunner.manager.save(row);

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
