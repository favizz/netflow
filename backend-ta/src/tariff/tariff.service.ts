import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Tariff } from './entities/tariff.entity';

export class CreateTariffDto {
  utility_type!: 'electricity' | 'water';
  price_per_unit!: number;
  effective_date!: string;
}

@Injectable()
export class TariffService {
  constructor(
    @InjectRepository(Tariff)
    private readonly repo: Repository<Tariff>,
  ) {}

  findAll(): Promise<Tariff[]> {
    return this.repo.find({ order: { utility_type: 'ASC', effective_date: 'DESC' } });
  }

  async findCurrent(utilityType: 'electricity' | 'water'): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const tariff = await this.repo.findOne({
      where: { utility_type: utilityType, effective_date: LessThanOrEqual(today) },
      order: { effective_date: 'DESC' },
    });
    if (!tariff) return utilityType === 'electricity' ? 1444.7 : 5000;
    return Number(tariff.price_per_unit);
  }

  create(dto: CreateTariffDto): Promise<Tariff> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: number, dto: Partial<Pick<CreateTariffDto, 'price_per_unit' | 'effective_date'>>): Promise<Tariff> {
    const tariff = await this.repo.findOne({ where: { id } });
    if (!tariff) throw new NotFoundException('Tariff not found');
    Object.assign(tariff, dto);
    return this.repo.save(tariff);
  }

  async remove(id: number): Promise<{ deleted: boolean }> {
    const tariff = await this.repo.findOne({ where: { id } });
    if (!tariff) throw new NotFoundException('Tariff not found');
    await this.repo.remove(tariff);
    return { deleted: true };
  }
}
