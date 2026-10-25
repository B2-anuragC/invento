import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { FileJobsService } from './file-jobs.service.js';
import { FileProcessor } from './file.processor.js';

describe('Queued uploads', () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'invento-jobs-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  const file = { name: 'test.png', mimeType: 'image/png', base64: Buffer.from('source').toString('base64') };
  it('stages bytes outside the queue database and configures retries', async () => {
    const queue = { add: vi.fn().mockImplementation(async (_name, _data, options) => ({ id: options.jobId })) };
    const service = new FileJobsService(queue as never, { root } as never);
    const result = await service.enqueue('business-a', file, 'product', 'actor');
    const [name, data, options] = queue.add.mock.calls[0];
    expect(name).toBe('process-upload');
    expect(data).not.toHaveProperty('base64');
    expect(await readFile(join(root, '.jobs', result.jobId), 'utf8')).toBe('source');
    expect(options).toMatchObject({ attempts: 3, backoff: { type: 'exponential' } });
    await expect(service.enqueue('../escape', file, 'product')).rejects.toThrow('Invalid upload');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
  it('hides jobs from other businesses and only publishes completed results', async () => {
    const job = { data: { businessId: 'business-a' }, attemptsMade: 1, getState: vi.fn().mockResolvedValue('completed'), returnvalue: { url: '/files/asset/original' } };
    const service = new FileJobsService({ getJob: vi.fn().mockResolvedValue(job) } as never, { root } as never);
    await expect(service.status('business-b', 'job')).rejects.toThrow('not found');
    expect(await service.status('business-a', 'job')).toMatchObject({ state: 'completed', result: job.returnvalue });
    job.getState.mockResolvedValue('active');
    expect(await service.status('business-a', 'job')).not.toHaveProperty('result');
  });
  it('processes staged files, stops retrying invalid content, and cleans up on completion', async () => {
    const queue = { add: vi.fn().mockImplementation(async (_name, data, options) => ({ id: options.jobId, data })) };
    const files = { root, store: vi.fn().mockResolvedValue({ url: '/files/asset/original' }) };
    const service = new FileJobsService(queue as never, files as never);
    const { jobId } = await service.enqueue('business-a', file, 'product', 'actor');
    const job = { id: jobId, name: 'process-upload', data: queue.add.mock.calls[0][1] };
    const processor = new FileProcessor(files as never, { businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER', business: { isActive: true } }) } } as never);
    expect(await processor.process(job as never)).toEqual({ url: '/files/asset/original' });
    expect(files.store).toHaveBeenCalledWith('business-a', file, 'product');
    files.store.mockRejectedValue(new BadRequestException('Invalid image'));
    await expect(processor.process(job as never)).rejects.toBeInstanceOf(UnrecoverableError);
    await processor.completed(job as never);
    await expect(readFile(join(root, '.jobs', jobId))).rejects.toThrow();
    await expect(processor.process({ ...job, data: { ...job.data, stagingId: '../escape' } } as never)).rejects.toBeInstanceOf(UnrecoverableError);
  });
  it('reauthorizes queued uploads and stops a revoked actor before touching the file', async () => {
    const files = { root, store: vi.fn() };
    const db = { businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'CUSTOM', business: { isActive: true }, user: { isActive: true }, roleDefinition: { permissions: [] } }) } };
    const processor = new FileProcessor(files as never, db as never);
    await expect(processor.process({ name: 'process-upload', data: { businessId: 'business-a', userId: 'revoked', stagingId: crypto.randomUUID(), kind: 'product' } } as never)).rejects.toThrow('permission');
    expect(files.store).not.toHaveBeenCalled();
  });

});
