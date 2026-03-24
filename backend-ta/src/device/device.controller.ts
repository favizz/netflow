import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { DeviceService } from './device.service';

@Controller('device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  // Pattern: "device/+/data" -> Tanda + adalah wildcard (bisa diganti ID apa saja)
  @MessagePattern('device/+/data')
  async handleSensorData(@Payload() data: any) {
    // MQTT seringkali mengirim buffer, kita parse ke JSON
    // Catatan: NestJS biasanya sudah auto-parse jika formatnya JSON
    console.log('Raw Data masuk:', data);
    
    // Panggil Service untuk simpan ke DB
    await this.deviceService.saveSensorData(data);
  }
}