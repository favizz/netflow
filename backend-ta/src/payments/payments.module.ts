import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitModule } from '../unit/unit.module';
import { Transaction } from './entities/transaction.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Transaction } from './entities/transaction.entity';
import { Property } from '../unit/entities/property.entity';

@Module({
<<<<<<< HEAD
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    UnitModule,
  ],
=======
  imports: [TypeOrmModule.forFeature([Transaction, Property]), UnitModule],
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
