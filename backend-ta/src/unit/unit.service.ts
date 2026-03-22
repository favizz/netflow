import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { Device } from '../device/entities/device.entity';
import { CurrentBalance } from '../device/entities/current-balance.entity';
import { TelemetryLog } from '../device/entities/telemetry-log.entity';
import { UtilityTariff } from '../payments/entities/utility-tariff.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

@Injectable()
export class UnitService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(CurrentBalance)
    private readonly balanceRepo: Repository<CurrentBalance>,
    @InjectRepository(TelemetryLog)
    private readonly telemetryRepo: Repository<TelemetryLog>,
    @InjectRepository(UtilityTariff)
    private readonly tariffRepo: Repository<UtilityTariff>,
  ) {}

  async create(dto: CreateUnitDto) {
    const existing = await this.propertyRepo.findOne({ where: { unit_id: dto.unit_id } });
    if (existing) throw new BadRequestException('unit_id already exists');

    const property = this.propertyRepo.create({
      unit_id: dto.unit_id,
      user_id: dto.user_id,
      location_floor: dto.location_floor,
      status: dto.status || 'Active',
    });

    await this.propertyRepo.save(property);

    if (dto.device_id) {
      let device = await this.deviceRepo.findOne({ where: { device_id: dto.device_id } });
      if (!device) {
        device = this.deviceRepo.create({
          device_id: dto.device_id,
          unit_id: property.unit_id,
          is_active: true,
          relay_status: true,
          valve_status: true,
        });
      } else {
        device.unit_id = property.unit_id;
      }
      await this.deviceRepo.save(device);

      let balance = await this.balanceRepo.findOne({ where: { device_id: device.device_id } });
      if (!balance) {
        balance = this.balanceRepo.create({
          device_id: device.device_id,
          current_kwh: 0,
          current_m3: 0,
        });
        await this.balanceRepo.save(balance);
      }
    }

    return property;
  }

  findAll() {
    return this.propertyRepo.find({ order: { unit_id: 'ASC' } });
  }

  async findOne(id: string) {
    const property = await this.propertyRepo.findOne({ where: { unit_id: id } });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  async findByUnitNo(unit_id: string) {
    return this.findOne(unit_id);
  }

  async update(id: string, dto: UpdateUnitDto) {
    const property = await this.findOne(id);
    if (dto.location_floor) property.location_floor = dto.location_floor;
    if (dto.status) property.status = dto.status;
    if (dto.user_id) property.user_id = dto.user_id;

    if (dto.device_id !== undefined) {
       const oldDevice = await this.deviceRepo.findOne({ where: { unit_id: property.unit_id } });
       if (oldDevice) {
         oldDevice.unit_id = null as any; 
         await this.deviceRepo.save(oldDevice);
       }
       if (dto.device_id) {
         let newDevice = await this.deviceRepo.findOne({ where: { device_id: dto.device_id } });
         if (newDevice) {
           newDevice.unit_id = property.unit_id;
           await this.deviceRepo.save(newDevice);
         }
       }
    }

    return this.propertyRepo.save(property);
  }

  async remove(id: string) {
    const property = await this.findOne(id);
    
    // Unlink device
    const device = await this.deviceRepo.findOne({ where: { unit_id: property.unit_id } });
    if (device) {
      device.unit_id = null as any;
      await this.deviceRepo.save(device);
    }

    await this.propertyRepo.remove(property);
    return { deleted: true, unit_id: id };
  }

  async getLatestTariff(type: 'electricity' | 'water') {
    const tariffs = await this.tariffRepo.find({ where: { utility_type: type }, order: { effective_date: 'DESC' } });
    if (tariffs.length > 0 && tariffs[0].price_per_unit) {
      return Number(tariffs[0].price_per_unit);
    }
    return type === 'electricity' ? 1444.70 : 5000;
  }

  async creditBalanceByUnitNo(unit_id: string, amount: number) {
    const property = await this.findOne(unit_id);
    const device = await this.deviceRepo.findOne({ where: { unit_id: property.unit_id } });
    if (!device) throw new NotFoundException('No device linked to property');
    
    let balance = await this.balanceRepo.findOne({ where: { device_id: device.device_id } });
    if (!balance) throw new NotFoundException('No balance record found');

    const tariff = await this.getLatestTariff('electricity');
    const kwhAdded = Number(amount) / tariff;
    
    balance.current_kwh = Number(balance.current_kwh || 0) + kwhAdded;
    return this.balanceRepo.save(balance);
  }

  async setRelayStatus(id: string, relayStatus: boolean) {
    const property = await this.findOne(id);
    const device = await this.deviceRepo.findOne({ where: { unit_id: property.unit_id } });
    if (device) {
      device.relay_status = relayStatus;
      await this.deviceRepo.save(device);
    }
    return property;
  }

  async setTariff(id: string, energyTariff: number) {
    // Note: Tariffs are now global in utility_tariff table.
    // However, if we need to set a specific tariff, we might just create a new utility_tariff entry.
    // For simplicity of backward compatibility:
    const tariff = this.tariffRepo.create({
      utility_type: 'electricity',
      price_per_unit: energyTariff,
      effective_date: new Date(),
    });
    await this.tariffRepo.save(tariff);
    return { success: true, energyTariff };
  }

  async applyTokenEngineDeduction(id: string, payload: { energyDeltaKwh: number }) {
    const property = await this.findOne(id);
    const device = await this.deviceRepo.findOne({ where: { unit_id: property.unit_id } });
    if (!device) throw new NotFoundException('Device not found attached to unit');

    const balance = await this.balanceRepo.findOne({ where: { device_id: device.device_id } });
    if (!balance) throw new NotFoundException('Balance not found');

    const energyDeltaKwh = Math.max(0, payload.energyDeltaKwh || 0);
    
    balance.current_kwh = Math.max(0, Number(balance.current_kwh || 0) - energyDeltaKwh);
    
    if (balance.current_kwh <= 0 && device.relay_status) {
      device.relay_status = false;
      await this.deviceRepo.save(device);
    }

    await this.balanceRepo.save(balance);

    const tariffVal = await this.getLatestTariff('electricity');

    return {
      unitId: property.unit_id,
      energyDeltaKwh,
      tariff: tariffVal,
      deductedAmount: Number((energyDeltaKwh * tariffVal).toFixed(2)),
      remainingBalanceKwh: Number(balance.current_kwh),
      relayStatus: device.relay_status,
    };
  }

  async getOwnerDashboard(unit_id: string) {
    const property = await this.findByUnitNo(unit_id);
    const device = await this.deviceRepo.findOne({ where: { unit_id: property.unit_id } });
    
    let balanceKwh = 0;
    let relayStatus = false;
    let online = false;
    let lastTelemetryAt: string | null = null;

    if (device) {
      relayStatus = !!device.relay_status;
      const balance = await this.balanceRepo.findOne({ where: { device_id: device.device_id } });
      balanceKwh = Number(balance?.current_kwh || 0);

      const latest = await this.telemetryRepo.findOne({
        where: { device_id: device.device_id },
        order: { time: 'DESC' },
      });

      lastTelemetryAt = latest?.time ? new Date(latest.time).toISOString() : null;
      online = lastTelemetryAt
        ? Date.now() - new Date(lastTelemetryAt).getTime() <= 5 * 60 * 1000
        : false;
    }

    const tariff = await this.getLatestTariff('electricity');
    const balanceRp = balanceKwh * tariff;

    const averageKwhPerHour = 0.85;
    const estimateHours = averageKwhPerHour > 0 ? balanceKwh / averageKwhPerHour : 0;

    return {
      id: property.unit_id,
      unitNo: property.unit_id,
      balance: Number(balanceRp.toFixed(2)),
      energyTariff: tariff,
      relayStatus,
      remainingEstimate: {
        kwh: Number(balanceKwh.toFixed(2)),
        hours: Number(estimateHours.toFixed(1)),
      },
      connectivity: {
        online,
        lastTelemetryAt,
      },
    };
  }

  async getTowerConnectivity(tower?: string) {
    const properties = await this.propertyRepo.find({ order: { unit_id: 'ASC' } });
    const filtered = tower ? properties.filter((p) => p.unit_id.startsWith(`${tower.toUpperCase()}-`)) : properties;

    const rows = await Promise.all(
      filtered.map(async (p) => {
        const device = await this.deviceRepo.findOne({ where: { unit_id: p.unit_id } });
        let online = false;
        let lastTelemetryAt: string | null = null;
        let relayStatus = false;

        if (device) {
          relayStatus = !!device.relay_status;
          const latest = await this.telemetryRepo.findOne({
            where: { device_id: device.device_id },
            order: { time: 'DESC' },
          });

          lastTelemetryAt = latest?.time ? new Date(latest.time).toISOString() : null;
          online = lastTelemetryAt
            ? Date.now() - new Date(lastTelemetryAt).getTime() <= 5 * 60 * 1000
            : false;
        }

        return {
          unitNo: p.unit_id,
          deviceId: device?.device_id || null,
          online,
          relayStatus,
          lastTelemetryAt,
        };
      }),
    );

    const onlineCount = rows.filter((r) => r.online).length;

    return {
      tower: tower?.toUpperCase() || 'ALL',
      totalUnits: rows.length,
      onlineUnits: onlineCount,
      offlineUnits: rows.length - onlineCount,
      units: rows,
    };
  }

  async getUnitNotifications(unit_id: string) {
    const dashboard = await this.getOwnerDashboard(unit_id);
    const notifications: Array<{ type: 'warning' | 'error' | 'info'; message: string; timestamp: string }> = [];

    if (dashboard.balance <= 20000) {
      notifications.push({
        type: 'warning',
        message: 'Saldo hampir habis. Lakukan top-up untuk menghindari cut-off.',
        timestamp: new Date().toISOString(),
      });
    }

    if (!dashboard.relayStatus && dashboard.balance <= 0) {
      notifications.push({
        type: 'error',
        message: 'Relay unit dalam status OFF. Layanan terputus karena kehabisan saldo.',
        timestamp: new Date().toISOString(),
      });
    }

    if (!dashboard.connectivity.online) {
      notifications.push({
        type: 'error',
        message: 'Gangguan unit terdeteksi: perangkat offline.',
        timestamp: new Date().toISOString(),
      });
    }

    if (notifications.length === 0) {
      notifications.push({
        type: 'info',
        message: 'Status unit normal.',
        timestamp: new Date().toISOString(),
      });
    }

    return notifications;
  }
}
