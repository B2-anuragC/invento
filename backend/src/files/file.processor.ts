import { BadRequestException, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { FILE_QUEUE, type FileJob } from './file-jobs.service.js';
import { FilesService } from './files.service.js';

@Processor(FILE_QUEUE, { concurrency: 2 })
export class FileProcessor extends WorkerHost {
  constructor(private readonly files: FilesService) { super(); }
  async process(job: Job<FileJob>) {
    const { businessId, stagingId, name, mimeType, kind } = job.data;
    if (job.name !== 'process-upload' || !/^[0-9a-f-]{36}$/.test(stagingId)) throw new UnrecoverableError('Invalid upload job.');
    const source = join(this.files.root, '.jobs', stagingId);
    try {
      const bytes = await readFile(source);
      // Content-derived file IDs make repeated execution safe after worker restarts.
      return await this.files.store(businessId, { name, mimeType, base64: bytes.toString('base64') }, kind);
    } catch (error) {
      if (error instanceof BadRequestException) throw new UnrecoverableError(error.message);
      throw error;
    }
  }
  @OnWorkerEvent('completed')
  async completed(job: Job<FileJob>) {
    try { await unlink(join(this.files.root, '.jobs', job.data.stagingId)); }
    catch { new Logger(FileProcessor.name).warn(`Could not remove source for completed upload ${job.id}.`); }
  }
}
