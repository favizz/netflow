import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { UpdateAdminAccessDto } from './dto/update-admin-access.dto';
import { AdminService } from './admin.service';
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

  // --- Legacy admin accounts (in-memory) ---

  @Get('accounts')
  listAccounts() {
    return this.adminService.listAccounts();
  }

  @Patch('accounts/:email/access')
  updateAccess(@Param('email') email: string, @Body() payload: UpdateAdminAccessDto) {
    return this.adminService.updateAccount(email, payload);
  }

  // --- Transactions ---

  @Get('transactions')
  getTransactions() {
    return this.adminService.getTransactions();
  }

  @Get('anomalies')
  async getRecentAnomalies() {
    const units = await this.unitService.findAll();
    const results = await Promise.all(
      units.map(u => this.anomalyService.getAnomaliesForUnit(u.unit_no))
    );
    // Flatten, sort by detectedAt desc, return latest 20
    return results
      .flat()
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .slice(0, 20);
  }

  // --- Resident management (registered Google accounts) ---

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
}
