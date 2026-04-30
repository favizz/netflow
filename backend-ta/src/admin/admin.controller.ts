import {
  Body, Controller, Delete, Get, Logger, Param, ParseIntPipe, Patch, Post, Request, UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { AdminJwtGuard } from '../common/guards/admin-jwt.guard';

interface AdminRequest extends ExpressRequest {
  user?: { sub?: string };
}
import { UpdateAdminAccessDto } from './dto/update-admin-access.dto';
import { AdminService, CalibrationSettings } from './admin.service';
import { ResidentsService } from '../residents/residents.service';
import { UnitService } from '../unit/unit.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { TariffService, CreateTariffDto } from '../tariff/tariff.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { HealthService } from './health.service';

class CreateResidentDto {
  email!: string;
  name?: string;
}

@Controller('admin')
@UseGuards(AdminJwtGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly adminService: AdminService,
    private readonly residentsService: ResidentsService,
    private readonly unitService: UnitService,
    private readonly anomalyService: AnomalyService,
    private readonly tariffService: TariffService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private adminEmail(req: AdminRequest): string {
    return req.user?.sub ?? 'unknown';
  }

  // ── Admin accounts ────────────────────────────────────────────────────────

  @Get('accounts')
  listAccounts() {
    return this.residentsService.findAdmins();
  }

  @Patch('accounts/:email/access')
  async updateAccess(
    @Param('email') email: string,
    @Body() payload: UpdateAdminAccessDto,
    @Request() req: AdminRequest,
  ) {
    const role = payload.enabled === false ? 'resident' : 'admin';
    const result = await this.residentsService.setRole(email, role as 'resident' | 'admin');
    void this.auditLogService.log(this.adminEmail(req), 'UPDATE_ACCESS', 'resident', email, { role });
    return result;
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  @Get('transactions')
  getTransactions() {
    return this.adminService.getTransactions();
  }

  // ── Anomalies ─────────────────────────────────────────────────────────────

  @Get('anomalies')
  async getRecentAnomalies() {
    const units = await this.unitService.findAll();
    const results = await Promise.all(
      units.map(u => this.anomalyService.getAnomaliesForUnit(u.unit_no))
    );
    return results
      .flat()
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .slice(0, 20);
  }

  // ── Residents ─────────────────────────────────────────────────────────────

  @Get('residents')
  listResidents() {
    return this.residentsService.findAll();
  }

  @Post('residents')
  async createResident(@Body() dto: CreateResidentDto, @Request() req: AdminRequest) {
    const result = await this.residentsService.create(dto.email, dto.name);
    void this.auditLogService.log(this.adminEmail(req), 'CREATE', 'resident', dto.email, { name: dto.name });
    return result;
  }

  @Delete('residents/:email')
  async removeResident(@Param('email') email: string, @Request() req: AdminRequest) {
    await this.residentsService.remove(email);
    void this.auditLogService.log(this.adminEmail(req), 'DELETE', 'resident', email);
    return { deleted: true };
  }

  @Post('residents/:email/units/:unitId')
  async assignUnit(
    @Param('email') email: string,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Request() req: AdminRequest,
  ) {
    const result = await this.unitService.setResidentEmail(unitId, email);
    void this.auditLogService.log(this.adminEmail(req), 'ASSIGN_UNIT', 'unit', unitId, { email });
    return result;
  }

  @Delete('residents/:email/units/:unitId')
  async unassignUnit(
    @Param('email') email: string,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Request() req: AdminRequest,
  ) {
    const result = await this.unitService.setResidentEmail(unitId, null);
    void this.auditLogService.log(this.adminEmail(req), 'UNASSIGN_UNIT', 'unit', unitId, { email });
    return result;
  }

  // ── Calibration settings ──────────────────────────────────────────────────

  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  async updateSettings(@Body() body: Partial<CalibrationSettings>, @Request() req: AdminRequest) {
    this.logger.log(`Request to update calibration settings from ${this.adminEmail(req)}`);
    const result = await this.adminService.updateSettings(body);
    void this.auditLogService.log(this.adminEmail(req), 'UPDATE_SETTINGS', 'calibration', null, body as Record<string, unknown>);
    return result;
  }

  @Post('push-config/:deviceId')
  pushConfig(@Param('deviceId') deviceId: string) {
    this.logger.log(`Request to push config to ${deviceId}`);
    return this.adminService.pushConfigToDevice(deviceId);
  }

  @Post('push-config')
  pushConfigAll() {
    this.logger.log(`Request to push config to all devices`);
    return this.adminService.pushConfigToAll();
  }

  // ── Direct device command (relay / valve) ────────────────────────────────

  @Post('command/:deviceId')
  sendCommand(
    @Param('deviceId') deviceId: string,
    @Body() body: { type: 'relay' | 'valve'; value: 0 | 1 },
    @Request() req: AdminRequest,
  ) {
    this.logger.log(`Request to send command [${body.type}=${body.value}] to ${deviceId} from ${this.adminEmail(req)}`);
    this.adminService.sendCommand(deviceId, body.type, body.value);
    void this.auditLogService.log(this.adminEmail(req), 'SEND_COMMAND', 'device', deviceId, body as Record<string, unknown>);
    return { sent: true, deviceId, type: body.type, value: body.value };
  }

  @Post('command')
  async sendCommandAll(
    @Body() body: { type: 'relay' | 'valve'; value: 0 | 1 },
    @Request() req: AdminRequest,
  ) {
    const result = await this.adminService.sendCommandToAll(body.type, body.value);
    void this.auditLogService.log(this.adminEmail(req), 'SEND_COMMAND_ALL', 'device', null, body as Record<string, unknown>);
    return result;
  }

  // ── OTA firmware update ───────────────────────────────────────────────────

  @Post('ota/:deviceId')
  pushOta(
    @Param('deviceId') deviceId: string,
    @Body() body: { version: string; binaryLink: string; updateNow?: boolean },
    @Request() req: AdminRequest,
  ) {
    this.logger.log(`Request to push OTA to ${deviceId} from ${this.adminEmail(req)}`);
    this.adminService.pushOtaToDevice(deviceId, body.version, body.binaryLink, body.updateNow ?? true);
    void this.auditLogService.log(this.adminEmail(req), 'OTA_PUSH', 'device', deviceId, body as Record<string, unknown>);
    return { pushed: [deviceId] };
  }

  @Post('ota')
  async pushOtaAll(
    @Body() body: { version: string; binaryLink: string; updateNow?: boolean },
    @Request() req: AdminRequest,
  ) {
    this.logger.log(`Request to push OTA to all devices from ${this.adminEmail(req)}`);
    const result = await this.adminService.pushOtaToAll(body.version, body.binaryLink, body.updateNow ?? true);
    void this.auditLogService.log(this.adminEmail(req), 'OTA_PUSH_ALL', 'device', null, body as Record<string, unknown>);
    return result;
  }

  // ── Tariffs ───────────────────────────────────────────────────────────────

  @Get('tariff')
  listTariffs() {
    return this.tariffService.findAll();
  }

  @Post('tariff')
  async createTariff(@Body() dto: CreateTariffDto, @Request() req: AdminRequest) {
    const result = await this.tariffService.create(dto);
    void this.auditLogService.log(this.adminEmail(req), 'CREATE', 'tariff', result.id, dto as unknown as Record<string, unknown>);
    return result;
  }

  @Patch('tariff/:id')
  async updateTariff(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<Pick<CreateTariffDto, 'price_per_unit' | 'effective_date'>>,
    @Request() req: AdminRequest,
  ) {
    const result = await this.tariffService.update(id, dto);
    void this.auditLogService.log(this.adminEmail(req), 'UPDATE', 'tariff', id, dto as unknown as Record<string, unknown>);
    return result;
  }

  @Delete('tariff/:id')
  async deleteTariff(@Param('id', ParseIntPipe) id: number, @Request() req: AdminRequest) {
    const result = await this.tariffService.remove(id);
    void this.auditLogService.log(this.adminEmail(req), 'DELETE', 'tariff', id);
    return result;
  }

  // ── Audit Logs ────────────────────────────────────────────────────────────

  @Get('audit-logs')
  getAuditLogs() {
    return this.auditLogService.findRecent(200);
  }

  @Post('client-error')
  logClientError(@Body() body: { message?: string; stack?: string; url?: string }, @Request() req: AdminRequest) {
    return this.auditLogService.log(
      this.adminEmail(req),
      'CLIENT_ERROR',
      'frontend',
      null,
      { message: body.message, stack: body.stack, url: body.url } as Record<string, unknown>,
      'failure',
    );
  }
}
