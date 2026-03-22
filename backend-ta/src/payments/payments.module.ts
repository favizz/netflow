import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitModule } from '../unit/unit.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Transaction } from './entities/transaction.entity';
import { Property } from '../unit/entities/property.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Property]), UnitModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
