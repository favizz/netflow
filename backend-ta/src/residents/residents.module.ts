import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resident } from './resident.entity';
import { ResidentsService } from './residents.service';

@Module({
  imports: [TypeOrmModule.forFeature([Resident])],
  providers: [ResidentsService],
  exports: [ResidentsService],
})
export class ResidentsModule {}
