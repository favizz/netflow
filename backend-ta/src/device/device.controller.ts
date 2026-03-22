import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { DeviceService } from './device.service';

@Controller('device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @MessagePattern('device/+/data')
  async handleSensorData(@Payload() data: any) {
    console.log('Raw Data masuk:', data);
    await this.deviceService.saveSensorData(data);
  }

  @UseGuards(AdminApiKeyGuard)
  @Post()
  create(@Body() createDto: any) {
    return this.deviceService.create(createDto);
  }

  @UseGuards(AdminApiKeyGuard)
  @Get()
  findAll() {
    return this.deviceService.findAll();
  }

  @UseGuards(AdminApiKeyGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deviceService.findOne(id);
  }

  @UseGuards(AdminApiKeyGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: any) {
    return this.deviceService.update(id, updateDto);
  }

  @UseGuards(AdminApiKeyGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.deviceService.remove(id);
  }
}