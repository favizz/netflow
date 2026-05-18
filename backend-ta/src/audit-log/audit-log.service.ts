import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  log(
    adminEmail: string,
    action: string,
    entity: string,
    entityId?: string | number | null,
    details?: Record<string, unknown> | null,
    result: 'success' | 'failure' | 'info' = 'success',
  ): Promise<AuditLog> {
    const entry = this.repo.create({
      actor: adminEmail,
      action,
      target_type: entity,
      target: entityId != null ? String(entityId) : null,
      details: details ? JSON.stringify(details) : null,
      result,
    });
    return this.repo.save(entry);
  }

  findRecent(limit = 100): Promise<AuditLog[]> {
    return this.repo.find({ order: { created_at: 'DESC' }, take: limit });
  }
}
