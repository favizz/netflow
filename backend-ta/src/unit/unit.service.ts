import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, In } from 'typeorm';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { Unit } from './entities/unit.entity';
import { MeterReading } from '../device/entities/device.entity';
import { TariffService } from '../tariff/tariff.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const LOW_TOKEN_THRESHOLD_KWH = 10;

@Injectable()
export class UnitService {
  /** Adjusted dynamically by AdminService whenever SENSOR_SAMPLING_TIME changes. */
  private onlineThresholdMs = 5 * 60 * 1000;

  constructor(
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(MeterReading)
    private readonly meterRepo: Repository<MeterReading>,
    private readonly tariffService: TariffService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Called by AdminService on startup and whenever calibration settings change. */
  setOnlineThresholdMs(ms: number): void {
    this.onlineThresholdMs = Math.max(30_000, ms);
  }

  async create(createUnitDto: CreateUnitDto) {
    const existing = await this.unitRepo.findOne({
      where: { unit_no: createUnitDto.unit_no },
    });
    if (existing) {
      throw new BadRequestException('unit_no already exists');
    }

    const entity = this.unitRepo.create({
      building_id: createUnitDto.building_id ?? 1,
      unit_no: createUnitDto.unit_no,
      device_id: createUnitDto.device_id,
      token_electricity: 0,
      token_water: 0,
      relay_status: true,
      last_energy_reading: 0,
      last_water_reading: 0,
    });

    return this.unitRepo.save(entity);
  }

  findAll(buildingId?: number) {
    if (buildingId) {
      return this.unitRepo.find({
        where: { building_id: buildingId },
        order: { unit_no: 'ASC' },
      });
    }
    return this.unitRepo.find({ order: { unit_no: 'ASC' } });
  }

  async countByBuilding(buildingId: number): Promise<number> {
    return this.unitRepo.count({ where: { building_id: buildingId } });
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
    return this.unitRepo.find({
      where: { resident_email: email },
      order: { unit_no: 'ASC' },
    });
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

  async creditTokensByUnitNo(
    unitNo: string,
    amount: number,
    type: 'electricity' | 'water',
  ) {
    const unit = await this.findByUnitNo(unitNo);
    if (type === 'electricity') {
      unit.token_electricity = Number(unit.token_electricity) + Number(amount);
    } else {
      unit.token_water = Number(unit.token_water) + Number(amount);
    }
    return this.unitRepo.save(unit);
  }

  /** Streams units that have a device_id in stable ID order, chunk by chunk.
   *  Never loads the whole table into memory — safe at any scale. */
  async *streamAllWithDevice(chunkSize = 500): AsyncGenerator<Unit[]> {
    let offset = 0;
    while (true) {
      const batch = await this.unitRepo.find({
        where: { device_id: Not(IsNull()) },
        order: { id: 'ASC' },
        take: chunkSize,
        skip: offset,
      });
      if (batch.length === 0) break;
      yield batch;
      if (batch.length < chunkSize) break;
      offset += batch.length;
    }
  }

  /** Bulk-update relay or valve state for a set of unit IDs in one SQL UPDATE. */
  async bulkSetActuation(
    ids: number[],
    type: 'relay' | 'valve',
    value: boolean,
  ): Promise<void> {
    if (ids.length === 0) return;
    const update =
      type === 'relay' ? { relay_status: value } : { valve_status: value };
    await this.unitRepo.update({ id: In(ids) }, update);
  }

  async checkDeviceOnline(deviceId: string): Promise<boolean> {
    if (!deviceId) return false;
    const latest = await this.meterRepo.findOne({
      where: { device_id: deviceId },
      order: { time: 'DESC' },
    });
    if (!latest?.time) return false;
    return (
      Date.now() - new Date(latest.time).getTime() <= this.onlineThresholdMs
    );
  }

  async setRelayStatus(id: number, relayStatus: boolean, actorEmail?: string) {
    const unit = await this.findOne(id);
    unit.relay_status = relayStatus;
    const saved = await this.unitRepo.save(unit);

    if (actorEmail) {
      void this.auditLogService.log(
        actorEmail,
        'REMOTE_ACTUATION',
        'unit',
        id.toString(),
        { type: 'relay', value: relayStatus, unit_no: unit.unit_no },
      );
    }

    return saved;
  }

  async setValveStatus(id: number, valveStatus: boolean, actorEmail?: string) {
    const unit = await this.findOne(id);
    unit.valve_status = valveStatus;
    const saved = await this.unitRepo.save(unit);

    if (actorEmail) {
      void this.auditLogService.log(
        actorEmail,
        'REMOTE_ACTUATION',
        'unit',
        id.toString(),
        { type: 'valve', value: valveStatus, unit_no: unit.unit_no },
      );
    }

    return saved;
  }

  async getOwnerDashboard(unitNo: string) {
    const unit = await this.findByUnitNo(unitNo);
    const [energyTariff, waterTariff] = await Promise.all([
      this.tariffService.findCurrent('electricity'),
      this.tariffService.findCurrent('water'),
    ]);

    const averageKwhPerHour = 0.85;
    const estimateHours =
      averageKwhPerHour > 0
        ? Number(unit.token_electricity) / averageKwhPerHour
        : 0;

    const latest = await this.meterRepo.findOne({
      where: { device_id: unit.device_id },
      order: { time: 'DESC' },
    });

    const lastTelemetryAt = latest?.time
      ? new Date(latest.time).toISOString()
      : null;
    const online = lastTelemetryAt
      ? Date.now() - new Date(lastTelemetryAt).getTime() <=
        this.onlineThresholdMs
      : false;

    return {
      id: unit.id,
      unitNo: unit.unit_no,
      tokenElectricity: Number(unit.token_electricity),
      tokenWater: Number(unit.token_water),
      energyTariff,
      waterTariff,
      relayStatus: unit.relay_status,
      valveStatus: unit.valve_status,
      remainingEstimate: {
        kwh: Number(unit.token_electricity),
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
    const filtered = tower
      ? units.filter((u) => u.unit_no.startsWith(`${tower.toUpperCase()}-`))
      : units;

    const deviceIds = filtered.map((u) => u.device_id).filter(Boolean);

    // Single query: latest telemetry timestamp per device (replaces N+1)
    const latestMap = new Map<string, Date>();
    if (deviceIds.length > 0) {
      const latestReadings: { device_id: string; last_time: string }[] =
        await this.meterRepo
          .createQueryBuilder('mr')
          .select('mr.device_id', 'device_id')
          .addSelect('MAX(mr.time)', 'last_time')
          .where('mr.device_id IN (:...deviceIds)', { deviceIds })
          .groupBy('mr.device_id')
          .getRawMany();

      for (const row of latestReadings) {
        if (row.last_time)
          latestMap.set(row.device_id, new Date(row.last_time));
      }
    }

    const now = Date.now();
    const rows = filtered.map((u) => {
      const lastTime = latestMap.get(u.device_id);
      const lastTelemetryAt = lastTime ? lastTime.toISOString() : null;
      const online = lastTime
        ? now - lastTime.getTime() <= this.onlineThresholdMs
        : false;

      return {
        unitNo: u.unit_no,
        deviceId: u.device_id,
        online,
        relayStatus: u.relay_status,
        lastTelemetryAt,
      };
    });

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
    const notifications: Array<{
      type: 'warning' | 'error' | 'info';
      message: string;
      timestamp: string;
    }> = [];

    if (Number(unit.token_electricity) <= LOW_TOKEN_THRESHOLD_KWH) {
      notifications.push({
        type: 'warning',
        message:
          'Token listrik hampir habis. Lakukan top-up untuk menghindari cut-off.',
        timestamp: new Date().toISOString(),
      });
    }

    if (!unit.relay_status) {
      notifications.push({
        type: 'error',
        message:
          'Relay unit dalam status OFF. Layanan terputus atau sedang dibatasi.',
        timestamp: new Date().toISOString(),
      });
    }

    const latest = await this.meterRepo.findOne({
      where: { device_id: unit.device_id },
      order: { time: 'DESC' },
    });

    const online = latest?.time
      ? Date.now() - new Date(latest.time).getTime() <= this.onlineThresholdMs
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

