import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { postgresQueues } from '../config/postgres-queue.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FilesService, type UploadKind } from './files.service.js';

export const FILE_QUEUE = 'file-processing';
export type FileJob = { businessId: string; userId?: string; supportAuditId?: string; stagingId: string; name: string; mimeType: string; kind: UploadKind };
type FileQueue = InstanceType<typeof postgresQueues.Queue<FileJob>>;
type FileQueueEvents = InstanceType<typeof postgresQueues.QueueEvents>;

@Injectable()
export class FileJobsService implements OnModuleDestroy {
  private events?: FileQueueEvents;
  constructor(@InjectQueue(FILE_QUEUE) private readonly queue: FileQueue, private readonly files: FilesService) {}

  async enqueue(businessId: string, file: { name: string; mimeType: string; base64: string }, kind: UploadKind, userId?: string, supportAuditId?: string) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(businessId) || !['product', 'customer', 'sale', 'purchase'].includes(kind)) throw new BadRequestException('Invalid upload reference.');
    if (!file.name?.trim() || file.name.length > 160 || !file.mimeType || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64) || file.base64.length > 13981016) throw new BadRequestException('Choose a valid file up to 10 MB.');
    if (kind !== 'purchase' && !file.mimeType.startsWith('image/')) throw new BadRequestException('Choose an image for this upload.');
    const bytes = Buffer.from(file.base64, 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new BadRequestException('Choose a file up to 10 MB.');
    const stagingId = randomUUID();
    const directory = join(this.files.root, '.jobs');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // PostgreSQL holds references only; source bytes live on the persistent upload volume.
    await writeFile(join(directory, stagingId), bytes, { mode: 0o600, flag: 'wx' });
    try {
      const job = await this.queue.add('process-upload', { businessId, userId, supportAuditId, stagingId, name: file.name, mimeType: file.mimeType, kind }, {
        jobId: stagingId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 1000 },
      });
      return { jobId: job.id!, statusUrl: `/files/jobs/${job.id}` };
    } catch {
      // Retain the source: a lost queue acknowledgement may still mean the job was accepted.
      throw new ServiceUnavailableException('Could not queue this upload. Please retry.');
    }
  }

  async upload(businessId: string, file: { name: string; mimeType: string; base64: string }, kind: UploadKind, userId?: string, supportAuditId?: string) {
    // Compatibility endpoint waits for the worker. New clients can use POST /files/jobs.
    this.events ??= new postgresQueues.QueueEvents(FILE_QUEUE, { connection: this.queue.opts.connection });
    await this.events.waitUntilReady();
    const { jobId } = await this.enqueue(businessId, file, kind, userId, supportAuditId);
    const job = await this.queue.getJob(jobId);
    if (!job) throw new ServiceUnavailableException('Upload job unavailable.');
    try { return await job.waitUntilFinished(this.events, 120000); }
    catch {
      if (await job.getState() === 'failed') throw new BadRequestException('Could not process this file. Check the file and try again.');
      throw new ServiceUnavailableException({ message: 'Upload is still processing. Check its status before retrying.', jobId, statusUrl: `/files/jobs/${jobId}` });
    }
  }

  async status(businessId: string, jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job || job.data.businessId !== businessId) throw new NotFoundException('Upload job not found in this business.');
    const state = await job.getState();
    return { jobId, kind: job.data.kind, state, attemptsMade: job.attemptsMade, ...(state === 'completed' ? { result: job.returnvalue } : {}), ...(state === 'failed' ? { error: 'Could not process this file. Check the file and try again.' } : {}) };
  }

  async onModuleDestroy() { await this.events?.close(); }
}
