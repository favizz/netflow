import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtGuard } from '../common/guards/admin-jwt.guard';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitService } from './unit.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Controller('unit')
export class UnitController {
  constructor(private readonly unitService: UnitService) {}

  @UseGuards(AdminJwtGuard)
  @Post()
  create(@Body() createUnitDto: CreateUnitDto) {
    return this.unitService.create(createUnitDto);
  }

  @Get()
  findAll() {
    return this.unitService.findAll();
  }

  @Get('dashboard/:unitNo')
  dashboard(@Param('unitNo') unitNo: string) {
    return this.unitService.getOwnerDashboard(unitNo);
  }

  @Get('connectivity')
  connectivity(@Query('tower') tower?: string) {
    return this.unitService.getTowerConnectivity(tower);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.unitService.findOne(+id);
  }

  @UseGuards(AdminJwtGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUnitDto: UpdateUnitDto) {
    return this.unitService.update(+id, updateUnitDto);
  }

  @UseGuards(AdminJwtGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.unitService.remove(+id);
  }

  @UseGuards(AdminJwtGuard)
  @Patch(':id/relay')
  relay(@Param('id') id: string, @Body() body: { relayStatus: boolean }, @CurrentUser() user: JwtPayload) {
    return this.unitService.setRelayStatus(+id, Boolean(body.relayStatus), user.sub);
  }

  @UseGuards(AdminJwtGuard)
  @Patch(':id/valve')
  valve(@Param('id') id: string, @Body() body: { valveStatus: boolean }, @CurrentUser() user: JwtPayload) {
    return this.unitService.setValveStatus(+id, Boolean(body.valveStatus), user.sub);
  }

  @Get(':unitNo/notifications')
  notifications(@Param('unitNo') unitNo: string) {
    return this.unitService.getUnitNotifications(unitNo);
  }
}
