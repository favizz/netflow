import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { Property } from '../unit/entities/property.entity';
import { CurrentBalance } from './entities/current-balance.entity';
import { TelemetryLog } from './entities/telemetry-log.entity';
import { UtilityTariff } from '../payments/entities/utility-tariff.entity';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    @InjectRepository(CurrentBalance)
    private readonly balanceRepo: Repository<CurrentBalance>,
    @InjectRepository(TelemetryLog)
    private readonly telemetryRepo: Repository<TelemetryLog>,
    @InjectRepository(UtilityTariff)
    private readonly tariffRepo: Repository<UtilityTariff>,
    private readonly dataSource: DataSource,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
  ) {}

  async create(data: any) {
    const existing = await this.deviceRepo.findOne({ where: { device_id: data.device_id } });
    if (existing) throw new BadRequestException('device_id already exists');

    const device = this.deviceRepo.create({
      device_id: data.device_id,
      unit_id: data.unit_id || null,
      serial_number: data.serial_number || null,
      is_active: data.is_active ?? true,
      relay_status: data.relay_status !== undefined ? data.relay_status : true,
      valve_status: data.valve_status !== undefined ? data.valve_status : true,
    });
    
    await this.deviceRepo.save(device);

    const balance = this.balanceRepo.create({
      device_id: device.device_id,
      current_kwh: 0,
      current_m3: 0,
    });
    await this.balanceRepo.save(balance);

    return device;
  }

  findAll() {
    return this.deviceRepo.find();
  }

  async findOne(id: string) {
    const device = await this.deviceRepo.findOne({ where: { device_id: id } });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async update(id: string, data: any) {
    const device = await this.findOne(id);
    if (data.unit_id !== undefined) device.unit_id = data.unit_id;
    if (data.serial_number !== undefined) device.serial_number = data.serial_number;
    if (data.is_active !== undefined) device.is_active = data.is_active;
    if (data.relay_status !== undefined) device.relay_status = data.relay_status;
    if (data.valve_status !== undefined) device.valve_status = data.valve_status;

    return this.deviceRepo.save(device);
  }

  async remove(id: string) {
    const device = await this.findOne(id);
    
    // Cleanup balance relation first
    const balance = await this.balanceRepo.findOne({ where: { device_id: id } });
    if (balance) await this.balanceRepo.remove(balance);

    await this.deviceRepo.remove(device);
    return { success: true };
  }

  async saveSensorData(payload: any) {
    const deviceId = payload?.dev_id || payload?.device_id;
    if (!deviceId) return;

    const incomingEnergyTotal = Number(payload?.et || payload?.energy_total || 0);
    const incomingVolumeTotal = Number(payload?.v_m3 || payload?.volume_m3 || payload?.volume_total_m3 || 0);
    const voltage = this.toNumber(payload?.v);
    const current = this.toNumber(payload?.i);
    const power = this.toNumber(payload?.p);
    const waterFlow = this.toNumber(payload?.wf || payload?.water_flow);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const device = await queryRunner.manager.findOne(Device, {
        where: { device_id: deviceId },
      });

      if (device) {
        const balance = await queryRunner.manager.findOne(CurrentBalance, {
          where: { device_id: deviceId },
          lock: { mode: 'pessimistic_write' },
        });

        if (balance) {
          // Identify the most recent telemetry to figure out delta
          const latestLog = await queryRunner.manager.findOne(TelemetryLog, {
            where: { device_id: deviceId },
            order: { time: 'DESC' },
          });

          const lastEnergy = latestLog?.energy_total_kwh || 0;
          const deltaEnergy = Math.max(0, incomingEnergyTotal - lastEnergy);

          // Find tariff
          const tariffs = await queryRunner.manager.find(UtilityTariff, {
            where: { utility_type: 'electricity' },
            order: { effective_date: 'DESC' },
          });
          const tariff = tariffs.length > 0 ? Number(tariffs[0].price_per_unit) : 1444.70;
          
          if (deltaEnergy > 0) {
              balance.current_kwh = Math.max(0, Number(balance.current_kwh || 0) - deltaEnergy);
          }

          if (Number(balance.current_kwh) <= 0 && device.relay_status) {
            balance.current_kwh = 0;
            device.relay_status = false;
            await queryRunner.manager.save(device);
            this.mqttClient.emit(`device/${deviceId}/cmd`, { relay: 'OFF', reason: 'NO_BALANCE' });
          }

          await queryRunner.manager.save(balance);
        }
      }

      const log = new TelemetryLog();
      log.time = new Date();
      log.device_id = deviceId;
      log.utility_type = 'electricity';
      log.energy_total_kwh = incomingEnergyTotal;
      log.tegangan_v = voltage !== null ? voltage : 0;
      log.arus_a = current !== null ? current : 0;
      log.power_factor = power !== null ? power : 0;
      log.debit_lpm = waterFlow !== null ? waterFlow : 0;
      log.volume_total_m3 = incomingVolumeTotal;
      log.status_relay = device?.relay_status || false;
      log.status_valve = device?.valve_status || false;

      await queryRunner.manager.save(log);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private toNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
