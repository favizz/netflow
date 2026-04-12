import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, MqttContext } from '@nestjs/microservices';
import { DeviceService } from './device.service';

@Controller('device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  // Pattern: "device/+/data" -> + is a wildcard matching any device_id segment
  @MessagePattern('device/+/data')
  async handleSensorData(@Payload() data: any, @Ctx() ctx: MqttContext) {
    // Extract device_id from the topic (e.g. "device/DEV-A-101/data" -> "DEV-A-101")
    const topic: string = ctx.getTopic();
    const deviceId = topic.split('/')[1] ?? null;

    // Merge device_id into payload so service doesn't need to parse the topic itself
    const enriched = typeof data === 'object' && data !== null
      ? { ...data, _deviceId: deviceId }
      : { _deviceId: deviceId };

    await this.deviceService.saveSensorData(enriched);
  }
}