import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { UnitModule } from '../admin/unit/unit.module';
import { AuditLogModule } from '../admin/audit-log/audit-log.module';
import { SharedMqttClientModule } from '../common/shared-mqtt-client.module';
import { Transaction } from './entities/transaction.entity';
import { TopupDelivery } from './entities/topup-delivery.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TopupDeliveryService } from './topup-delivery.service';
import { TopupDeliveryPublisherService } from './topup-delivery-publisher.service';
import {
  PaymentExpiryProcessor,
  PAYMENT_EXPIRY_QUEUE,
} from './payment-expiry.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, TopupDelivery]),
    UnitModule,
    AuditLogModule,
    SharedMqttClientModule,
    BullModule.registerQueue({ name: PAYMENT_EXPIRY_QUEUE }),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentExpiryProcessor,
    TopupDeliveryService,
    TopupDeliveryPublisherService,
  ],
  exports: [
    PaymentsService,
    TopupDeliveryService,
    TopupDeliveryPublisherService,
  ],
})
export class PaymentsModule {}
