import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { decode } from '@msgpack/msgpack';
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

    // Decode payload: supports MessagePack binary buffer or plain JSON object
    let data: Record<string, any>;
    if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
      data = decode(payload) as Record<string, any>;
    } else if (typeof payload === 'object' && payload !== null) {
      // Already parsed by NestJS (JSON or enriched object from controller)
      data = payload as Record<string, any>;
    } else {
      return; // unrecognised format
    }

    const incomingEnergyTotal = Number(data.et || 0);
    const incomingWaterTotal  = Number(data.wt || 0);
    const voltage  = this.toNumber(data.v);
    const current  = this.toNumber(data.c);
    const power    = this.toNumber(data.p);
    const waterFlow = this.toNumber(data.wf);

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
              this.mqttClient.emit(`device/${deviceId}/relay/set`, '0');
            }
            if (unit.valve_status) {
              unit.valve_status = false;
              this.mqttClient.emit(`device/${deviceId}/valve/set`, '0');
            }
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
        water_total: incomingWaterTotal || null,
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
