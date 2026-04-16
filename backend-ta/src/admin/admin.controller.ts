import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { UpdateAdminAccessDto } from './dto/update-admin-access.dto';
import { AdminService, CalibrationSettings } from './admin.service';
import { ResidentsService } from '../residents/residents.service';
import { UnitService } from '../unit/unit.service';
import { AnomalyService } from '../anomaly/anomaly.service';

class CreateResidentDto {
  email!: string;
  name?: string;
}

class AssignUnitDto {
  unitId!: number;
}

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly residentsService: ResidentsService,
    private readonly unitService: UnitService,
    private readonly anomalyService: AnomalyService,
  ) {}

  // ── Admin accounts ────────────────────────────────────────────────────────

  @Get('accounts')
  listAccounts() {
    return this.adminService.listAccounts();
  }

  @Patch('accounts/:email/access')
  updateAccess(@Param('email') email: string, @Body() payload: UpdateAdminAccessDto) {
    return this.adminService.updateAccount(email, payload);
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
  createResident(@Body() dto: CreateResidentDto) {
    return this.residentsService.create(dto.email, dto.name);
  }

  @Delete('residents/:email')
  removeResident(@Param('email') email: string) {
    return this.residentsService.remove(email);
  }

  @Post('residents/:email/units/:unitId')
  assignUnit(@Param('email') email: string, @Param('unitId', ParseIntPipe) unitId: number) {
    return this.unitService.setResidentEmail(unitId, email);
  }

  @Delete('residents/:email/units/:unitId')
  unassignUnit(@Param('email') email: string, @Param('unitId', ParseIntPipe) unitId: number) {
    return this.unitService.setResidentEmail(unitId, null);
  }

  // ── Calibration settings ──────────────────────────────────────────────────

  /** GET  /admin/settings — read current calibration values */
  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  /** PUT  /admin/settings — update calibration values (in-memory) */
  @Patch('settings')
  updateSettings(@Body() body: Partial<CalibrationSettings>) {
    return this.adminService.updateSettings(body);
  }

  /**
   * POST /admin/push-config/:deviceId
   * Push calibration config as MsgPack binary to a single device.
   * Payload on wire: device/{deviceId}/config → { cf, cp, st }
   */
  @Post('push-config/:deviceId')
  pushConfig(@Param('deviceId') deviceId: string) {
    return this.adminService.pushConfigToDevice(deviceId);
  }

  /**
   * POST /admin/push-config
   * Push calibration config to every registered device at once.
   */
  @Post('push-config')
  pushConfigAll() {
    return this.adminService.pushConfigToAll();
  }
}
