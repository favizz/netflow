import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { encodeCommand } from '../common/binary-codec';
import { AdminService } from './admin.service';
import { UnitService } from './unit/unit.service';

interface CommandJobData {
  commandType: 'relay' | 'valve';
  value: 0 | 1;
}

interface OtaJobData {
  version: string;
  binaryLink: string;
  updateNow: boolean;
}

@Processor('broadcast')
@Injectable()
export class BroadcastProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastProcessor.name);

  constructor(
    private readonly adminService: AdminService,
    private readonly unitService: UnitService,
  ) {
    super();
  }

  async process(job: Job): Promise<{ processed: number }> {
    this.logger.log(`[broadcast/${job.name}] Starting job ${job.id}`);
    let processed = 0;

    if (job.name === 'command') {
      const { commandType, value } = job.data as CommandJobData;
      const payload = encodeCommand(commandType, value);

      for await (const chunk of this.unitService.streamAllWithDevice()) {
        for (const unit of chunk) {
          this.adminService.publishRetained(
            `device/${unit.device_id}/command`,
            payload,
          );
        }
        // Mirror state into DB so dashboards reflect intent immediately
        await this.unitService.bulkSetActuation(
          chunk.map((u) => u.id),
          commandType,
          value === 1,
        );
        processed += chunk.length;
        await job.updateProgress(processed);
      }
    } else if (job.name === 'config') {
      const PARALLEL = 50;
      for await (const chunk of this.unitService.streamAllWithDevice()) {
        for (let i = 0; i < chunk.length; i += PARALLEL) {
          chunk
            .slice(i, i + PARALLEL)
            .forEach((u) => this.adminService.pushConfigToDevice(u.device_id!));
        }
        processed += chunk.length;
        await job.updateProgress(processed);
      }
    } else if (job.name === 'ota') {
      const { version, binaryLink, updateNow } = job.data as OtaJobData;
      for await (const chunk of this.unitService.streamAllWithDevice()) {
        for (const unit of chunk) {
          this.adminService.pushOtaToDevice(
            unit.device_id!,
            version,
            binaryLink,
            updateNow,
          );
        }
        processed += chunk.length;
        await job.updateProgress(processed);
      }
    }

    this.logger.log(
      `[broadcast/${job.name}] Job ${job.id} complete — ${processed} device(s)`,
    );
    return { processed };
  }
}
