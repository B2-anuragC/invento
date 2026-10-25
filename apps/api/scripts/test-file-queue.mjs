import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { nestQueueConnection } from '../dist/config/postgres-queue.js';
import { FILE_QUEUE, FileJobsService } from '../dist/files/file-jobs.service.js';
import { FileProcessor } from '../dist/files/file.processor.js';
import { FilesService } from '../dist/files/files.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';

const database = process.argv[process.argv.indexOf('--database') + 1];
if (!process.argv.includes('--database') || !database || !/_(test|review)/.test(new URL(database).pathname)) {
  throw new Error('Pass --database with an isolated PostgreSQL database containing _test or _review in its name.');
}
const root = await mkdtemp(join(tmpdir(), 'invento-pg-queue-'));
const actor = `queue-test-${randomUUID()}`;
const revokedActor = `queue-test-${randomUUID()}`;
let allowed = true;
let attempts = 0;
const result = { url: '/files/verified/original' };
const files = { root, store: async (_business, file) => {
  assert.equal(Buffer.from(file.base64, 'base64').toString(), 'source');
  if (++attempts === 1) throw new Error('Simulated transient storage failure');
  return result;
} };
const prisma = { businessUser: { findUnique: async () => ({
  isActive: allowed, role: 'OWNER', business: { isActive: true }, user: { isActive: true },
}) } };
class QueueTestModule {}
Module({
  imports: [BullModule.forRoot({ connection: nestQueueConnection(database) }), BullModule.registerQueue({ name: FILE_QUEUE })],
  providers: [
    { provide: FilesService, useValue: files }, { provide: PrismaService, useValue: prisma },
    { provide: FileProcessor, useFactory: () => new FileProcessor(files, prisma) },
    { provide: FileJobsService, inject: [getQueueToken(FILE_QUEUE)], useFactory: queue => new FileJobsService(queue, files) },
  ],
})(QueueTestModule);
let app;
let queue;
let worker;
async function waitFor(check) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await check()) return; await delay(50); }
  throw new Error('Timed out waiting for queue state');
}
try {
  app = await NestFactory.createApplicationContext(QueueTestModule, { logger: ['error'] });
  queue = app.get(getQueueToken(FILE_QUEUE));
  worker = app.get(FileProcessor).worker;
  await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);
  // Do not accidentally obliterate someone else's jobs, even in a test database.
  assert.equal(await queue.count(), 0, 'Use an empty queue in an isolated test database');
  const jobs = app.get(FileJobsService);
  const file = { name: 'test.png', mimeType: 'image/png', base64: Buffer.from('source').toString('base64') };
  assert.deepEqual(await jobs.upload('business-a', file, 'product', actor), result);
  assert.equal(attempts, 2, 'A transient error must retry through PostgreSQL');
  const completed = await queue.getCompleted();
  const job = completed.find(job => job.data.userId === actor);
  assert.ok(job);
  assert.equal((await jobs.status('business-a', job.id)).state, 'completed');
  await assert.rejects(jobs.status('business-b', job.id), /not found/);
  await waitFor(async () => { try { await access(join(root, '.jobs', job.id)); return false; } catch { return true; } });
  allowed = false;
  const revoked = await jobs.enqueue('business-a', file, 'product', revokedActor);
  await waitFor(async () => (await jobs.status('business-a', revoked.jobId)).state === 'failed');
  assert.equal(attempts, 2, 'Revoked membership must stop execution before storage');
  assert.equal((await queue.getJob(revoked.jobId)).attemptsMade, 1, 'Permission failures must not retry');
  console.log('PASS: Nest PostgreSQL queue/worker/events, retries, result polling, business isolation, source cleanup and revoked membership.');
} finally {
  if (worker) await worker.close();
  // Remove only the jobs created by this test; never clear an entire database/schema.
  if (queue) {
    for (const job of await queue.getJobs(['completed', 'failed'])) {
      if ([actor, revokedActor].includes(job.data.userId)) await job.remove();
    }
  }
  await app?.close();
  await rm(root, { recursive: true, force: true });
}
