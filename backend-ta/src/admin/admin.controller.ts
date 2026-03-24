<<<<<<< HEAD
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
=======
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { AdminService } from './admin.service';
import { ResidentsService } from '../residents/residents.service';
import { UnitService } from '../unit/unit.service';

class CreateResidentDto {
  email!: string;
  name?: string;
}

class AssignUnitDto {
  unitId!: number;
}

@Controller('admin/users')
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly residentsService: ResidentsService,
    private readonly unitService: UnitService,
  ) {}

  // --- Legacy admin accounts (in-memory) ---

  @Post()
  create(@Body() createDto: any) {
    return this.adminService.create(createDto);
  }

  @Get()
  findAll() {
    return this.adminService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: any) {
    return this.adminService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminService.remove(id);
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
