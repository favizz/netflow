import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as net from 'net';
import * as http from 'http';
import * as https from 'https';

export type ServiceStatus = 'ok' | 'error' | 'configured' | 'not_configured';

export interface ServiceHealth {
  status: ServiceStatus;
  latencyMs: number | null;
}

export interface HealthReport {
  checkedAt: string;
  overall: 'healthy' | 'degraded' | 'critical';
  services: Record<string, ServiceHealth>;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly cfg: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis, mqtt, ml, smtp] = await Promise.all([
      this.checkDatabase(),
      this.checkTcpService(
        'Redis',
        this.cfg.get('REDIS_HOST', 'localhost'),
        this.cfg.get<number>('REDIS_PORT', 6379),
      ),
      this.checkMqtt(),
      this.checkMl(),
      Promise.resolve(this.checkSmtp()),
    ]);

    const critical = database.status === 'error' || mqtt.status === 'error';
    const degraded = redis.status === 'error' || ml.status === 'error';
    const overall = critical ? 'critical' : degraded ? 'degraded' : 'healthy';

    this.logger.log(
      `Health check: ${overall} (Redis: ${redis.status}, ML: ${ml.status})`,
    );

    return {
      checkedAt: new Date().toISOString(),
      overall,
      services: { database, redis, mqtt, ml, smtp },
    };
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.warn(`DB health check failed: ${(err as Error).message}`);
      return { status: 'error', latencyMs: null };
    }
  }

  private checkTcpService(
    name: string,
    host: string,
    port: number,
  ): Promise<ServiceHealth> {
    const start = Date.now();
    return new Promise((resolve) => {
      const sock = net.connect({ host, port, timeout: 3000 }, () => {
        sock.destroy();
        resolve({ status: 'ok', latencyMs: Date.now() - start });
      });
      sock.on('timeout', () => {
        sock.destroy();
        this.logger.warn(`${name} TCP check timed out (${host}:${port})`);
        resolve({ status: 'error', latencyMs: null });
      });
      sock.on('error', (err) => {
        this.logger.warn(`${name} TCP check failed: ${err.message}`);
        resolve({ status: 'error', latencyMs: null });
      });
    });
  }

  private checkMqtt(): Promise<ServiceHealth> {
    const url = this.cfg.get<string>('MQTT_BROKER_URL') ?? '';
    const match = url.match(/^mqtts?:\/\/([^/:]+):?(\d+)?/);
    const host = match?.[1] ?? 'localhost';
    const port = parseInt(match?.[2] ?? '1883', 10);
    return this.checkTcpService('MQTT', host, port);
  }

  private checkMl(): Promise<ServiceHealth> {
    const url = this.cfg.get<string>('ML_SERVICE_URL');
    if (!url) return Promise.resolve({ status: 'error', latencyMs: null });

    const start = Date.now();
    const fullUrl = `${url}/health`;
    const lib = fullUrl.startsWith('https') ? https : http;

    return new Promise((resolve) => {
      const req = lib.get(fullUrl, { timeout: 3000 }, (res) => {
        res.resume();
        resolve({
          status: res.statusCode === 200 ? 'ok' : 'error',
          latencyMs: Date.now() - start,
        });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 'error', latencyMs: null });
      });
      req.on('error', () => resolve({ status: 'error', latencyMs: null }));
    });
  }

  private checkSmtp(): ServiceHealth {
    const configured = !!(
      this.cfg.get<string>('SMTP_HOST') &&
      this.cfg.get<string>('SMTP_USER') &&
      this.cfg.get<string>('SMTP_PASS')
    );
    return {
      status: configured ? 'configured' : 'not_configured',
      latencyMs: null,
    };
  }
}
