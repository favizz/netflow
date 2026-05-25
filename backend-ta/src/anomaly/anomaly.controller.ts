import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, FindOptionsWhere } from 'typeorm';
import { AdminJwtGuard } from '../common/guards/admin-jwt.guard';
import { Anomaly } from './entities/anomaly.entity';
import { AnomalyQueryDto } from './dto/anomaly-query.dto';

interface PaginatedAnomalyResponse {
  data: Anomaly[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface AnomalyStats {
  totalActive: number;
  totalResolved: number;
  countByType: Record<string, number>;
  countBySeverity: Record<string, number>;
}

/**
 * Admin-facing HTTP controller for querying persisted anomaly records.
 * All endpoints require admin JWT authentication.
 */
@Controller('anomaly')
@UseGuards(AdminJwtGuard)
export class AnomalyController {
  constructor(
    @InjectRepository(Anomaly)
    private readonly anomalyRepo: Repository<Anomaly>,
  ) {}

  /**
   * Returns a paginated list of currently active (unresolved) anomalies.
   * Supports filtering by device ID, unit number, anomaly type, and severity.
   *
   * @param query - Optional filter and pagination parameters.
   * @returns Paginated anomaly records with total count and page metadata.
   */
  @Get('active')
  async getActiveAnomalies(
    @Query() query: AnomalyQueryDto,
  ): Promise<PaginatedAnomalyResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const whereClause: FindOptionsWhere<Anomaly> = {
      resolved_at: IsNull(),
    };

    if (query.deviceId) whereClause.device_id = query.deviceId;
    if (query.type) whereClause.type = query.type;
    if (query.severity) whereClause.severity = query.severity;

    const [data, total] = await this.anomalyRepo.findAndCount({
      where: whereClause,
      order: { created_at: 'DESC' },
      take: limit,
      skip,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Returns a paginated history of all anomaly records including resolved ones.
   * Supports filtering by device ID, anomaly type, and severity.
   *
   * @param query - Optional filter and pagination parameters.
   * @returns Paginated anomaly records sorted by creation time descending.
   */
  @Get('history')
  async getAnomalyHistory(
    @Query() query: AnomalyQueryDto,
  ): Promise<PaginatedAnomalyResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const whereClause: FindOptionsWhere<Anomaly> = {};

    if (query.deviceId) whereClause.device_id = query.deviceId;
    if (query.type) whereClause.type = query.type;
    if (query.severity) whereClause.severity = query.severity;

    const [data, total] = await this.anomalyRepo.findAndCount({
      where: whereClause,
      order: { created_at: 'DESC' },
      take: limit,
      skip,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Returns aggregate statistics across all anomaly records:
   * counts by type, counts by severity, and total active vs resolved counts.
   *
   * @returns Aggregate counts grouped by anomaly type and severity.
   */
  @Get('stats')
  async getAnomalyStats(): Promise<AnomalyStats> {
    const [activeCount, resolvedCount, allAnomalies] = await Promise.all([
      this.anomalyRepo.count({ where: { resolved_at: IsNull() } }),
      this.anomalyRepo.count({ where: { resolved_at: Not(IsNull()) } }),
      this.anomalyRepo.find({ select: ['type', 'severity'] }),
    ]);

    const countByType: Record<string, number> = {};
    const countBySeverity: Record<string, number> = {};

    for (const anomaly of allAnomalies) {
      countByType[anomaly.type] = (countByType[anomaly.type] ?? 0) + 1;
      countBySeverity[anomaly.severity] =
        (countBySeverity[anomaly.severity] ?? 0) + 1;
    }

    return {
      totalActive: activeCount,
      totalResolved: resolvedCount,
      countByType,
      countBySeverity,
    };
  }
}
