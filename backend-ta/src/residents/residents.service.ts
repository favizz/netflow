import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resident } from './resident.entity';

@Injectable()
export class ResidentsService {
  constructor(
    @InjectRepository(Resident)
    private readonly residentRepo: Repository<Resident>,
  ) {}

  findAll(): Promise<Resident[]> {
    return this.residentRepo.find({ order: { email: 'ASC' } });
  }

  findAdmins(): Promise<Resident[]> {
    return this.residentRepo.find({
      where: { role: 'admin' },
      order: { email: 'ASC' },
    });
  }

  findByEmail(email: string): Promise<Resident | null> {
    return this.residentRepo.findOne({ where: { email } });
  }

  async create(email: string, name?: string): Promise<Resident> {
    const existing = await this.residentRepo.findOne({ where: { email } });
    if (existing) throw new BadRequestException('Resident already registered');

    const resident = this.residentRepo.create({
      email,
      name: name ?? null,
      google_id: null,
      picture: null,
      role: 'resident',
    });
    return this.residentRepo.save(resident);
  }

  async remove(email: string): Promise<void> {
    const resident = await this.residentRepo.findOne({ where: { email } });
    if (!resident) throw new NotFoundException('Resident not found');
    await this.residentRepo.remove(resident);
  }

  async updateProfile(
    email: string,
    data: { googleId: string; name?: string | null; picture?: string | null },
  ): Promise<void> {
    await this.residentRepo.update(
      { email },
      {
        google_id: data.googleId,
        ...(data.name !== undefined && { name: data.name }),
        ...(data.picture !== undefined && { picture: data.picture }),
      },
    );
  }

  async setRole(email: string, role: 'resident' | 'admin'): Promise<Resident> {
    const resident = await this.residentRepo.findOne({ where: { email } });
    if (!resident) throw new NotFoundException('Resident not found');
    resident.role = role;
    return this.residentRepo.save(resident);
  }
}
