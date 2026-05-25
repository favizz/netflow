import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramController } from './telegram.controller';
import { ResidentsModule } from '../admin/residents/residents.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [ConfigModule, ResidentsModule, NotificationModule],
  controllers: [TelegramController],
})
export class TelegramModule {}
