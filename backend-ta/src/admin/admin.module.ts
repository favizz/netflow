import { Module } from '@nestjs/common';
<<<<<<< HEAD
import { ConfigModule } from '@nestjs/config';
import { ResidentsModule } from '../residents/residents.module';
import { UnitModule } from '../unit/unit.module';
=======
import { TypeOrmModule } from '@nestjs/typeorm';
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from './entities/user.entity';

@Module({
<<<<<<< HEAD
  imports: [ConfigModule, ResidentsModule, UnitModule],
=======
  imports: [TypeOrmModule.forFeature([User])],
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
