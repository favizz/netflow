import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { UnitService } from '../unit/unit.service';
import { PaymentsService } from '../payments/payments.service';
import {
  encodeCalibration,
  encodeCommand,
  encodeOta,
} from '../common/binary-codec';
import { CalibrationSetting } from './entities/calibration-setting.entity';
import { Building } from './entities/building.entity';

export interface CalibrationSettings {
  CAL_FACTOR_FLOWRATE: number;
  CAL_FACTOR_POWER: number;
  SENSOR_SAMPLING_TIME: number;
}

const DEFAULTS: CalibrationSettings = {
  CAL_FACTOR_FLOWRATE: 4.55,
  CAL_FACTOR_POWER: 1.05,
  SENSOR_SAMPLING_TIME: 5,
};

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);

  /** In-memory cache - loaded from DB on startup, written through on every update. */
  private cached: CalibrationSettings = { ...DEFAULTS };

  constructor(
    @InjectRepository(CalibrationSetting)
    private readonly calRepo: Repository<CalibrationSetting>,
    @InjectRepository(Building)
    private readonly buildingRepo: Repository<Building>,
    private readonly unitService: UnitService,
    private readonly paymentsService: PaymentsService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: ClientProxy,
    @InjectQueue('broadcast') private readonly broadcastQueue: Queue,
  ) {
    this.logger.log('AdminService initialized');
  }

  async onModuleInit() {
    await this.loadFromDb();
    this.syncOnlineThreshold();
  }

  /** Publish a single MQTT message with retain=true so offline devices receive
   *  it the moment they reconnect and resubscribe.  Falls back to a plain emit
   *  if the underlying mqtt.js socket is not yet open. */
  publishRetained(topic: string, payload: Buffer): void {
    // Access the raw mqtt.js MqttClient held inside NestJS ClientMqtt wrapper.
    const raw = (
      this.mqttClient as unknown as {
        mqttClient?: {
          connected?: boolean;
          publish?: (...a: unknown[]) => void;
        };
      }
    ).mqttClient;
    if (raw?.connected && raw.publish) {
      raw.publish(topic, payload, { retain: true, qos: 1 });
    } else {
      // Not yet connected — emit without retain as fallback (will be queued by ClientProxy)
      this.mqttClient.emit(topic, payload);
    }
  }

  private syncOnlineThreshold(): void {
    // 6 missed publishes before a device is considered offline; floor at 30 s.
    const ms = Math.max(30_000, this.cached.SENSOR_SAMPLING_TIME * 6 * 1000);
    this.unitService.setOnlineThresholdMs(ms);
  }

  // ── Buildings ─────────────────────────────────────────────────────────────

  async getBuildings(): Promise<Building[]> {
    return this.buildingRepo.find({ order: { code: 'ASC' } });
  }

  async createBuilding(data: {
    code: string;
    name: string;
    address?: string;
    floors?: number;
  }): Promise<Building> {
    const building = this.buildingRepo.create(data);
    return this.buildingRepo.save(building);
  }

  async updateBuilding(id: number, data: Partial<Building>): Promise<Building> {
    await this.buildingRepo.update(id, data);
    return this.buildingRepo.findOneOrFail({ where: { id } });
  }

  async deleteBuilding(id: number): Promise<void> {
    const count = await this.unitService.countByBuilding(id);
    if (count > 0) {
      throw new Error(
        `Cannot delete building because it has ${count} units assigned.`,
      );
    }
    await this.buildingRepo.delete(id);
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async getTransactions() {
    const rawTxs = await this.paymentsService.listAllTransactions();
    const units = await this.unitService.findAll();
    const unitMap = new Map(
      units.map((u) => [u.unit_no, u.resident_email || 'Unassigned']),
    );
    return rawTxs.map((tx) => ({
      ...tx,
      user: unitMap.get(tx.unitNo) || 'Unassigned',
      date: tx.createdAt,
      type: 'Token Purchase',
    }));
  }

  // ── Calibration settings (DB-backed) ─────────────────────────────────────

  getSettings(): CalibrationSettings {
    return { ...this.cached };
  }

  async updateSettings(
    patch: Partial<CalibrationSettings>,
  ): Promise<CalibrationSettings> {
    if (patch.CAL_FACTOR_FLOWRATE !== undefined) {
      this.cached.CAL_FACTOR_FLOWRATE = Math.min(
        5,
        Math.max(0, Number(patch.CAL_FACTOR_FLOWRATE)),
      );
    }
    if (patch.CAL_FACTOR_POWER !== undefined) {
      this.cached.CAL_FACTOR_POWER = Math.min(
        2,
        Math.max(0, Number(patch.CAL_FACTOR_POWER)),
      );
    }
    if (patch.SENSOR_SAMPLING_TIME !== undefined) {
      this.cached.SENSOR_SAMPLING_TIME = Math.min(
        10,
        Math.max(1, Math.round(Number(patch.SENSOR_SAMPLING_TIME))),
      );
    }
    await this.persistToDb(null);
    this.syncOnlineThreshold();
    return { ...this.cached };
  }

  async getDeviceSettings(deviceId: string): Promise<CalibrationSettings> {
    const override = await this.calRepo.findOne({
      where: { device_id: deviceId },
    });
    if (!override) return { ...this.cached };
    return {
      CAL_FACTOR_FLOWRATE: Number(override.flowrate_factor),
      CAL_FACTOR_POWER: Number(override.power_factor),
      SENSOR_SAMPLING_TIME: override.sampling_time,
    };
  }

  async pushConfigToDevice(
    deviceId: string,
    overrides?: Partial<CalibrationSettings>,
  ): Promise<void> {
    const base = overrides ? { ...this.cached, ...overrides } : this.cached;

    if (overrides) {
      await this.persistToDb(deviceId, overrides);
    }

    const payload = encodeCalibration({
      cf: base.CAL_FACTOR_FLOWRATE,
      cp: base.CAL_FACTOR_POWER,
      st: base.SENSOR_SAMPLING_TIME,
    });

    this.logger.log(
      `Pushing configuration to device [${deviceId}] | Hex: ${payload.toString('hex')}`,
    );
    this.publishRetained(`device/${deviceId}/config`, payload);
  }

  async pushConfigToAll(): Promise<{ pushed: string[] }> {
    const units = await this.unitService.findAll();
    const withDevice = units.filter((u) => u.device_id);
    this.logger.log(
      `Queuing config broadcast for [${withDevice.length}] units (job)`,
    );
    await this.broadcastQueue.add('config', {});
    return { pushed: withDevice.map((u) => u.device_id) };
  }

  // ── OTA firmware update ───────────────────────────────────────────────────

  pushOtaToDevice(
    deviceId: string,
    version: string,
    binaryLink: string,
    updateNow = true,
  ): void {
    const payload = encodeOta({ version, binaryLink, updateNow });
    this.logger.log(
      `Pushing OTA update to device [${deviceId}] (version: ${version}) | Hex: ${payload.slice(0, 10).toString('hex')}...`,
    );
    this.mqttClient.emit(`device/${deviceId}/ota`, payload);
  }

  // ── Direct device commands ────────────────────────────────────────────────

  sendCommand(deviceId: string, type: 'relay' | 'valve', value: 0 | 1): void {
    const payload = encodeCommand(type, value);
    this.logger.log(
      `Sending command [${type}=${value}] to device [${deviceId}] | Hex: ${payload.toString('hex')}`,
    );
    this.publishRetained(`device/${deviceId}/command`, payload);
  }

  async sendCommandToAll(
    type: 'relay' | 'valve',
    value: 0 | 1,
  ): Promise<{ pushed: string[] }> {
    const units = await this.unitService.findAll();
    const withDevice = units.filter((u) => u.device_id);
    this.logger.log(
      `Queuing command broadcast [${type}=${value}] for [${withDevice.length}] units (job)`,
    );
    await this.broadcastQueue.add('command', { commandType: type, value });
    return { pushed: withDevice.map((u) => u.device_id) };
  }

  async pushOtaToAll(
    version: string,
    binaryLink: string,
    updateNow = true,
  ): Promise<{ pushed: string[] }> {
    const units = await this.unitService.findAll();
    const withDevice = units.filter((u) => u.device_id);
    this.logger.log(
      `Queuing OTA broadcast v${version} for [${withDevice.length}] units (job)`,
    );
    await this.broadcastQueue.add('ota', { version, binaryLink, updateNow });
    return { pushed: withDevice.map((u) => u.device_id) };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async loadFromDb(): Promise<void> {
    try {
      const global = await this.calRepo.findOne({
        where: { device_id: IsNull() },
      });
      if (global) {
        this.cached = {
          CAL_FACTOR_FLOWRATE: Number(global.flowrate_factor),
          CAL_FACTOR_POWER: Number(global.power_factor),
          SENSOR_SAMPLING_TIME: global.sampling_time,
        };
      }
    } catch {
      // DB not ready (first boot before schema applied) - keep defaults
    }
  }

  private async persistToDb(
    deviceId: string | null,
    overrides?: Partial<CalibrationSettings>,
  ): Promise<void> {
    const settings = overrides ? { ...this.cached, ...overrides } : this.cached;

    try {
      const whereClause =
        deviceId === null ? { device_id: IsNull() } : { device_id: deviceId };
      let row = await this.calRepo.findOne({ where: whereClause });
      if (!row) {
        row = this.calRepo.create({ device_id: deviceId });
      }
      row.flowrate_factor = settings.CAL_FACTOR_FLOWRATE;
      row.power_factor = settings.CAL_FACTOR_POWER;
      row.sampling_time = settings.SENSOR_SAMPLING_TIME;
      await this.calRepo.save(row);
    } catch {
      // Non-fatal - in-memory value is still updated
    }
  }
}
