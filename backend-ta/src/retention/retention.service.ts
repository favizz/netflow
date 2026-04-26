import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { MeterReading } from '../device/entities/device.entity';
import { Transaction } from '../payments/entities/transaction.entity';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Data Retention Policy (Spec 2.1.7)
   * - Telemetry (meter_readings): 24 months
   * - Transactions: 60 months
   * Runs daily at 3:00 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleRetention() {
    this.logger.log('Starting data retention cleanup...');

    try {
      // 1. Clean up telemetry (24 months)
      const telemetryResult = await this.dataSource
        .createQueryBuilder()
        .delete()
        .from(MeterReading)
        .where('time < DATE_SUB(NOW(), INTERVAL 24 MONTH)')
        .execute();
      
      this.logger.log(`Deleted ${telemetryResult.affected || 0} old telemetry records.`);

      // 2. Clean up transactions (60 months)
      const transactionResult = await this.dataSource
        .createQueryBuilder()
        .delete()
        .from(Transaction)
        .where('created_at < DATE_SUB(NOW(), INTERVAL 60 MONTH)')
        .execute();

      this.logger.log(`Deleted ${transactionResult.affected || 0} old transaction records.`);

    } catch (error) {
      this.logger.error('Error during data retention cleanup:', error);
    }
  }
}
