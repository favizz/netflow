import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { PaymentCompletedListener } from './listeners/payment-completed.listener';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditLogService, PaymentCompletedListener],
  exports: [AuditLogService],
})
export class AuditLogModule {}
