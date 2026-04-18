import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { Unit } from './entities/unit.entity';
import { MeterReading } from '../device/entities/device.entity';
import { TariffService } from '../tariff/tariff.service';

@Injectable()
export class UnitService {
  constructor(
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    private readonly tariffService: TariffService,
  ) {}

  async create(createUnitDto: CreateUnitDto) {
    const existing = await this.unitRepo.findOne({ where: { unit_no: createUnitDto.unit_no } });
    if (existing) {
      throw new BadRequestException('unit_no already exists');
    }

    const entity = this.unitRepo.create({
      unit_no: createUnitDto.unit_no,
      device_id: createUnitDto.device_id,
      balance: createUnitDto.balance ?? 0,
      relay_status: true,
      last_energy_reading: 0,
      last_water_reading: 0,
    });

    return this.unitRepo.save(entity);
  }

  findAll() {
    return this.unitRepo.find({ order: { unit_no: 'ASC' } });
  }

  async findOne(id: number) {
    const unit = await this.unitRepo.findOne({ where: { id } });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }

  async findByUnitNo(unitNo: string) {
    const unit = await this.unitRepo.findOne({ where: { unit_no: unitNo } });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }

  findByResidentEmail(email: string): Promise<Unit[]> {
    return this.unitRepo.find({ where: { resident_email: email }, order: { unit_no: 'ASC' } });
  }

  async setResidentEmail(unitId: number, email: string | null): Promise<Unit> {
    const unit = await this.findOne(unitId);
    unit.resident_email = email;
    return this.unitRepo.save(unit);
  }

  async update(id: number, updateUnitDto: UpdateUnitDto) {
    const unit = await this.findOne(id);
    Object.assign(unit, updateUnitDto);
    return this.unitRepo.save(unit);
  }

  async remove(id: number) {
    const unit = await this.findOne(id);
    await this.unitRepo.remove(unit);
    return { deleted: true, id };
  }

  async creditBalanceByUnitNo(unitNo: string, amount: number) {
    const unit = await this.findByUnitNo(unitNo);
    unit.balance = Number(unit.balance) + Number(amount);
    return this.unitRepo.save(unit);
  }

  async setRelayStatus(id: number, relayStatus: boolean) {
    const unit = await this.findOne(id);
    unit.relay_status = relayStatus;
    return this.unitRepo.save(unit);
  }

  async getOwnerDashboard(unitNo: string) {
    const unit = await this.findByUnitNo(unitNo);
    const energyTariff = await this.tariffService.findCurrent('electricity');

    const remainingKwh = energyTariff > 0 ? Number(unit.balance) / energyTariff : 0;
    const averageKwhPerHour = 0.85;
    const estimateHours = averageKwhPerHour > 0 ? remainingKwh / averageKwhPerHour : 0;

    const latest = await this.meterRepo.findOne({
      where: { device_id: unit.device_id },
      order: { time: 'DESC' },
    });

    const lastTelemetryAt = latest?.time ? new Date(latest.time).toISOString() : null;
    const online = lastTelemetryAt
      ? Date.now() - new Date(lastTelemetryAt).getTime() <= 5 * 60 * 1000
      : false;

    return {
      id: unit.id,
      unitNo: unit.unit_no,
      balance: Number(unit.balance),
      energyTariff,
      relayStatus: unit.relay_status,
      remainingEstimate: {
        kwh: Number(remainingKwh.toFixed(2)),
        hours: Number(estimateHours.toFixed(1)),
      },
      connectivity: {
        online,
        lastTelemetryAt,
      },
    };
  }

  async getTowerConnectivity(tower?: string) {
    const units = await this.unitRepo.find({ order: { unit_no: 'ASC' } });
    const filtered = tower ? units.filter((u) => u.unit_no.startsWith(`${tower.toUpperCase()}-`)) : units;

    const rows = await Promise.all(
      filtered.map(async (u) => {
        const latest = await this.meterRepo.findOne({
          where: { device_id: u.device_id },
          order: { time: 'DESC' },
        });

        const lastTelemetryAt = latest?.time ? new Date(latest.time).toISOString() : null;
        const online = lastTelemetryAt
          ? Date.now() - new Date(lastTelemetryAt).getTime() <= 5 * 60 * 1000
          : false;

        return {
          unitNo: u.unit_no,
          deviceId: u.device_id,
          online,
          relayStatus: u.relay_status,
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

  async getUnitNotifications(unitNo: string) {
    const unit = await this.findByUnitNo(unitNo);
    const notifications: Array<{ type: 'warning' | 'error' | 'info'; message: string; timestamp: string }> = [];

    if (Number(unit.balance) <= 20000) {
      notifications.push({
        type: 'warning',
        message: 'Saldo hampir habis. Lakukan top-up untuk menghindari cut-off.',
        timestamp: new Date().toISOString(),
      });
    }

    if (!unit.relay_status) {
      notifications.push({
        type: 'error',
        message: 'Relay unit dalam status OFF. Layanan terputus atau sedang dibatasi.',
        timestamp: new Date().toISOString(),
      });
    }

    const latest = await this.meterRepo.findOne({
      where: { device_id: unit.device_id },
      order: { time: 'DESC' },
    });

    const online = latest?.time
      ? Date.now() - new Date(latest.time).getTime() <= 5 * 60 * 1000
      : false;

    if (!online) {
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
