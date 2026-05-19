import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { decodeTelemetry, encodeCommand } from '../common/binary-codec';
import { Unit } from '../unit/entities/unit.entity';
import { MeterReading } from './entities/device.entity';
import { AnomalyService } from '../anomaly/anomaly.service';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);
  constructor(
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    private readonly dataSource: DataSource,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
    private readonly anomalyService: AnomalyService,
  ) {}

  async saveSensorData(payload: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const deviceId: string | undefined =
      payload?._deviceId || payload?.dev_id || payload?.device_id; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
    if (!deviceId) return;

    let data: Record<string, any>;
    if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
      const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      if (buf.length < 21) return;
      data = decodeTelemetry(buf) as Record<string, any>;
    } else if (typeof payload === 'object' && payload !== null) {
      data = payload as Record<string, any>;
    } else {
      return;
    }

    const incomingEnergyTotal = Number(data.et || 0);
    const incomingWaterTotal = Number(data.wt || 0);
    const voltage = this.toNumber(data.v);
    const current = this.toNumber(data.c);
    const power = this.toNumber(data.p);
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

      if (!unit) {
        this.logger.warn(
          `No unit found for device_id="${deviceId}" — telemetry dropped. ` +
            `Check that units.device_id matches the MQTT topic prefix.`,
        );
      }

      if (unit) {
        let deltaEnergy = 0;
        if (incomingEnergyTotal > Number(unit.last_energy_reading)) {
          deltaEnergy = incomingEnergyTotal - Number(unit.last_energy_reading);
        }

        let deltaWater = 0;
        if (incomingWaterTotal > Number(unit.last_water_reading)) {
          deltaWater = incomingWaterTotal - Number(unit.last_water_reading);
        }

        // Direct token deduction
        if (deltaEnergy > 0) {
          unit.token_electricity = Math.max(
            0,
            Number(unit.token_electricity) - deltaEnergy,
          );
          unit.last_energy_reading = incomingEnergyTotal;
        }

        if (deltaWater > 0) {
          unit.token_water = Math.max(0, Number(unit.token_water) - deltaWater);
          unit.last_water_reading = incomingWaterTotal;
        }

        // Independent safety cutoffs
        if (Number(unit.token_electricity) <= 0 && unit.relay_status) {
          unit.relay_status = false;
          this.mqttClient.emit(
            `device/${deviceId}/command`,
            encodeCommand('relay', 0),
          );
        }
        if (Number(unit.token_water) <= 0 && unit.valve_status) {
          unit.valve_status = false;
          this.mqttClient.emit(
            `device/${deviceId}/command`,
            encodeCommand('valve', 0),
          );
        }

        await queryRunner.manager.save(unit);
        savedUnit = unit;

        const row = queryRunner.manager.create(MeterReading, {
          time: new Date(),
          device_id: deviceId,
          voltage,
          current,
          power,
          water_flow: waterFlow,
          // Use explicit null-check so 0 is stored as 0, not NULL
          energy_total: Number.isFinite(incomingEnergyTotal)
            ? incomingEnergyTotal
            : null,
          water_total: Number.isFinite(incomingWaterTotal)
            ? incomingWaterTotal
            : null,
        });
        try {
          await queryRunner.manager.save(row);
        } catch (dupErr: unknown) {
          // Two telemetry packets within the same MySQL-second share a PK —
          // skip the duplicate row but keep the token update in this transaction.
          if ((dupErr as { code?: string })?.code !== 'ER_DUP_ENTRY')
            throw dupErr;
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (savedUnit) {
      this.anomalyService.checkOnTelemetry(
        deviceId,
        savedUnit.unit_no,
        power,
        waterFlow,
        voltage,
        Number(savedUnit.token_electricity),
        Number(savedUnit.token_water),
        savedUnit.relay_status,
        savedUnit.valve_status,
      );
    }
  }

  private toNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
