import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  findAll() {
    return this.userRepo.find({ select: ['user_id', 'username', 'role', 'created_at'] });
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({ where: { user_id: id } });
    if (!user) throw new NotFoundException('User not found');
    const { password_hash: _, ...result } = user;
    return result;
  }

  async create(data: any) {
    const existing = await this.userRepo.findOne({ where: { username: data.username } });
    if (existing) throw new BadRequestException('Username already exists');

    const password_hash = await bcrypt.hash(data.password, 10);
    const user = this.userRepo.create({
      username: data.username,
      password_hash,
      role: data.role || 'viewer',
    });
    
    const saved = await this.userRepo.save(user);
    const { password_hash: _, ...result } = saved;
    return result;
  }

  async update(id: string, data: any) {
    const user = await this.userRepo.findOne({ where: { user_id: id } });
    if (!user) throw new NotFoundException('User not found');

    if (data.username) user.username = data.username;
    if (data.role) user.role = data.role;
    if (data.password) {
      user.password_hash = await bcrypt.hash(data.password, 10);
    }

    const saved = await this.userRepo.save(user);
    const { password_hash: _, ...result } = saved;
    return result;
  }

  async remove(id: string) {
    const user = await this.userRepo.findOne({ where: { user_id: id } });
    if (!user) throw new NotFoundException('User not found');
    await this.userRepo.remove(user);
    return { success: true };
  }
}
