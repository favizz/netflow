import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as net from 'net';

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
    const [database, redis, mqtt, smtp, telegram] = await Promise.all([
      this.checkDatabase(),
      this.checkTcpService(
        'Redis',
        this.cfg.get('REDIS_HOST', 'localhost'),
        this.cfg.get<number>('REDIS_PORT', 6379),
      ),
      this.checkMqtt(),
      Promise.resolve(this.checkSmtp()),
      Promise.resolve(this.checkTelegram()),
    ]);

    const critical = database.status === 'error' || mqtt.status === 'error';
    const degraded = redis.status === 'error';
    const overall = critical ? 'critical' : degraded ? 'degraded' : 'healthy';

    this.logger.log(`Health check: ${overall} (Redis: ${redis.status})`);

    return {
      checkedAt: new Date().toISOString(),
      overall,
      services: { database, redis, mqtt, smtp, telegram },
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

  private checkTelegram(): ServiceHealth {
    const configured = !!this.cfg.get<string>('TELEGRAM_BOT_TOKEN');
    return {
      status: configured ? 'configured' : 'not_configured',
      latencyMs: null,
    };
  }
}
