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
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitService } from './unit.service';

@Controller('unit')
export class UnitController {
  constructor(private readonly unitService: UnitService) {}

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
    return this.unitService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUnitDto: UpdateUnitDto) {
    return this.unitService.update(id, updateUnitDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.unitService.remove(id);
  }

  @Post(':id/token-engine/deduct')
  deduct(@Param('id') id: string, @Body() body: { energyDeltaKwh: number }) {
    return this.unitService.applyTokenEngineDeduction(id, body);
  }

  @UseGuards(AdminApiKeyGuard)
  @Patch(':id/relay')
  relay(@Param('id') id: string, @Body() body: { relayStatus: boolean }) {
    return this.unitService.setRelayStatus(id, Boolean(body.relayStatus));
  }

  @UseGuards(AdminApiKeyGuard)
  @Patch(':id/tariff')
  tariff(@Param('id') id: string, @Body() body: { energyTariff: number }) {
    return this.unitService.setTariff(id, Number(body.energyTariff));
  }

  @Get(':unitNo/notifications')
  notifications(@Param('unitNo') unitNo: string) {
    return this.unitService.getUnitNotifications(unitNo);
  }
}
