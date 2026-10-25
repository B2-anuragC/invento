import { PrismaService } from '../prisma/prisma.service.js';
import { requireBusinessPermission, supportAccess } from '../auth/business-access.js';
import { BadRequestException, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { FILE_QUEUE, type FileJob } from './file-jobs.service.js';
import { FilesService } from './files.service.js';

@Processor(FILE_QUEUE, { concurrency: 2 })
export class FileProcessor extends WorkerHost {
  constructor(private readonly files: FilesService, private readonly prisma: PrismaService) { super(); }
  async process(job: Job<FileJob>) {
    const { businessId, stagingId, name, mimeType, kind } = job.data;
    if (job.name !== 'process-upload' || !/^[0-9a-f-]{36}$/.test(stagingId)) throw new UnrecoverableError('Invalid upload job.');
    if (!job.data.userId) throw new UnrecoverableError('Resubmit this upload using the current application.');
    const authorize = async () => {
      const access = await requireBusinessPermission(this.prisma, job.data.userId!, businessId, 'files.upload');
      const domain = ({ product: 'products', customer: 'customers', sale: 'sales', purchase: 'purchases' } as const)[kind];
      if (!domain || (!access.permissions.includes(`${domain}.create`) && !access.permissions.includes(`${domain}.update`))) throw new Error('Resource permission revoked.');
    };
    try {
      if (job.data.supportAuditId) {
        const audit = await this.prisma.platformAuditLog.findUnique({ where: { id: job.data.supportAuditId } });
        const next = audit?.next as { permission?: string; operation?: string } | undefined;
        if (!audit || audit.actorId !== job.data.userId || audit.businessId !== businessId || audit.action !== 'BUSINESS_SUPPORT_ACCESS' || next?.permission !== 'files.upload' || !['FilesController.upload', 'FilesController.enqueue'].includes(next.operation || '') || audit.createdAt < new Date(Date.now() - 86400000)) throw new Error('Support authorization unavailable.');
        await supportAccess.run({ userId: job.data.userId, businessId, auditId: audit.id }, authorize);
        await this.prisma.platformAuditLog.create({ data: { actorId: job.data.userId, businessId, action: 'BUSINESS_SUPPORT_JOB_EXECUTION', targetType: 'file-job', targetId: String(job.id), reason: audit.reason, previous: {}, next: { supportAuditId: audit.id } } });
      } else await authorize();
    } catch { throw new UnrecoverableError('Upload permission is unavailable.'); }
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
