import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { decodeTelemetry, encodeCommand } from '../common/binary-codec';
import { Unit } from '../admin/unit/entities/unit.entity';
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

  async saveSensorData(payload: unknown, fallbackDeviceId?: string) {
    const p = payload as Record<string, string | undefined>;
    const deviceId: string | undefined =
      fallbackDeviceId || p?._deviceId || p?.dev_id || p?.device_id;
    if (!deviceId) return;

    let data: Record<string, any>;
    let hasTokenFields = false;
    if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
      const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      if (buf.length !== 25) return;
      hasTokenFields = true;
      data = decodeTelemetry(buf) as Record<string, any>;
    } else if (typeof payload === 'object' && payload !== null) {
      data = payload as Record<string, any>;
      hasTokenFields = data.te !== undefined || data.tw !== undefined;
    } else {
      return;
    }

    const incomingEnergyTotal = Number(data.et || 0);
    const incomingWaterTotal = Number(data.wt || 0);
    const incomingElectricityToken = this.toNumber(data.te);
    const incomingWaterToken = this.toNumber(data.tw);
    const voltage = this.toNumber(data.v);
    const current = this.toNumber(data.c);
    const power = this.toNumber(data.p);
    const waterFlow = this.toNumber(data.wf);

    await this.persistRawReading({
      deviceId,
      voltage,
      current,
      power,
      waterFlow,
      incomingEnergyTotal,
      incomingWaterTotal,
    });

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
          `No unit found for device_id="${deviceId}" - telemetry accounting skipped. ` +
            `Check that units.device_id matches the MQTT topic prefix.`,
        );
      }

      if (unit) {
        if (Number.isFinite(incomingEnergyTotal)) {
          unit.last_energy_reading = incomingEnergyTotal;
        }
        if (Number.isFinite(incomingWaterTotal)) {
          unit.last_water_reading = incomingWaterTotal;
        }

        if (hasTokenFields && incomingElectricityToken !== null) {
          unit.token_electricity = Math.max(0, incomingElectricityToken);
        }
        if (hasTokenFields && incomingWaterToken !== null) {
          unit.token_water = Math.max(0, incomingWaterToken);
        }

        if (data.rs !== undefined) {
          unit.relay_status = Number(data.rs) === 1;
        }
        if (data.vs !== undefined) {
          unit.valve_status = Number(data.vs) === 1;
        }

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

  private async persistRawReading(input: {
    deviceId: string;
    voltage: number | null;
    current: number | null;
    power: number | null;
    waterFlow: number | null;
    incomingEnergyTotal: number;
    incomingWaterTotal: number;
  }): Promise<void> {
    const reading = this.meterRepo.create({
      time: new Date(),
      device_id: input.deviceId,
      voltage: input.voltage,
      current: input.current,
      power: input.power,
      water_flow: input.waterFlow,
      energy_total: Number.isFinite(input.incomingEnergyTotal)
        ? input.incomingEnergyTotal
        : null,
      water_total: Number.isFinite(input.incomingWaterTotal)
        ? input.incomingWaterTotal
        : null,
    });

    try {
      await this.meterRepo.insert(reading);
    } catch (error: unknown) {
      if (!this.isDuplicateKey(error)) throw error;
    }
  }

  private toNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private isDuplicateKey(error: unknown): boolean {
    return (error as { code?: string })?.code === 'ER_DUP_ENTRY';
  }
}
