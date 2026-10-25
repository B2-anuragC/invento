import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { FilesService } from './files.service.js';

describe('Physical upload storage', () => {
  let root: string;
  let service: FilesService;
  const previous = { path: process.env.UPLOAD_STORAGE_PATH, bucket: process.env.S3_BUCKET };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'invento-files-'));
    process.env.UPLOAD_STORAGE_PATH = root; delete process.env.S3_BUCKET;
    service = new FilesService();
  });
  afterEach(async () => {
    service.onModuleDestroy(); vi.restoreAllMocks();
    if (previous.path === undefined) delete process.env.UPLOAD_STORAGE_PATH; else process.env.UPLOAD_STORAGE_PATH = previous.path;
    if (previous.bucket === undefined) delete process.env.S3_BUCKET; else process.env.S3_BUCKET = previous.bucket;
    await rm(root, { recursive: true, force: true });
  });
  const picture = async () => ({ name: 'large.png', mimeType: 'image/png', base64: (await sharp({ create: { width: 2200, height: 1100, channels: 3, background: '#176b50' } }).png().toBuffer()).toString('base64') });
  it('writes compressed full-size and thumbnail files, deduplicates retries, and scopes access', async () => {
    const file = await picture();
    const result = await service.store('business-a', file, 'product');
    expect(result.cloud).toBe('disabled'); expect(result).not.toHaveProperty('base64');
    const id = result.url.split('/')[2];
    const original = await service.read('business-a', id, 'original');
    const thumb = await service.read('business-a', id, 'thumbnail');
    expect((await sharp(original.data).metadata()).width).toBe(1600);
    expect((await sharp(thumb.data).metadata()).width).toBe(320);
    expect(original.mimeType).toBe('image/webp'); expect(thumb.data.length).toBeLessThan(original.data.length);
    expect(await service.store('business-a', file, 'product')).toEqual(result);
    expect(await readFile(join(root, 'business-a', id, 'metadata.json'), 'utf8')).not.toContain('base64');
    await expect(service.reference('business-b', result.url, 'product')).rejects.toThrow('not found');
    await expect(service.reference('business-a', result.url, 'customer')).rejects.toThrow('different upload type');
    await expect(service.read('business-a', '../outside', 'original')).rejects.toThrow('Invalid file reference');
  });
  it('does not enlarge small pictures and rejects corrupt or oversized inputs', async () => {
    const base64 = (await sharp({ create: { width: 20, height: 10, channels: 3, background: 'white' } }).png().toBuffer()).toString('base64');
    const result = await service.store('business-a', { name: 'small.png', mimeType: 'image/png', base64 }, 'customer');
    const thumb = await service.read('business-a', result.url.split('/')[2], 'thumbnail');
    expect((await sharp(thumb.data).metadata()).width).toBe(20);
    await expect(service.store('business-a', { name: 'bad.jpg', mimeType: 'image/jpeg', base64: 'aGVsbG8=' }, 'sale')).rejects.toThrow('process this image');
    await expect(service.store('business-a', { name: 'big.pdf', mimeType: 'application/pdf', base64: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64') }, 'purchase')).rejects.toThrow('10 MB');
  });
  it('keeps non-image reference bytes physically and generates a preview', async () => {
    const result = await service.store('business-a', { name: 'note.txt', mimeType: 'text/plain', base64: Buffer.from('Invoice note').toString('base64') }, 'purchase');
    const original = await service.read('business-a', result.url.split('/')[2], 'original');
    expect(original.data.toString()).toBe('Invoice note');
    const thumb = await service.read('business-a', result.url.split('/')[2], 'thumbnail');
    expect((await sharp(thumb.data).metadata()).format).toBe('webp');
    await expect(service.store('business-a', { name: 'bad.pdf', mimeType: 'application/pdf', base64: 'aGVsbG8=' }, 'purchase')).rejects.toThrow('valid PDF');
  });
  it('retains local files on S3 failure and retries both private objects', async () => {
    process.env.S3_BUCKET = 'test-bucket'; service = new FilesService();
    const send = vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('Offline'));
    const result = await service.store('business-a', await picture(), 'product');
    expect(result.cloud).toBe('pending');
    expect((await service.read('business-a', result.url.split('/')[2], 'original')).data.length).toBeGreaterThan(0);
    send.mockResolvedValue({} as never);
    await service.retryCloudUploads();
    const metadata = JSON.parse(await readFile(join(root, 'business-a', result.url.split('/')[2], 'metadata.json'), 'utf8'));
    expect(metadata.cloud).toBe('uploaded');
    const uploaded = send.mock.calls.filter(([command]) => command instanceof PutObjectCommand);
    expect(uploaded.some(([command]) => (command as PutObjectCommand).input.Key?.endsWith('/thumbnail'))).toBe(true);
    expect(uploaded.every(([command]) => (command as PutObjectCommand).input.ACL === undefined)).toBe(true);
  });
});
