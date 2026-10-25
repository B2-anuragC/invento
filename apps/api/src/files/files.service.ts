import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export type UploadKind = 'product' | 'customer' | 'sale' | 'purchase';
export type StoredAttachment = { name: string; mimeType: string; url: string; thumbnailUrl: string };
type Manifest = StoredAttachment & { id: string; kind: UploadKind; cloud: 'disabled' | 'pending' | 'uploaded'; originalType: string; size: number };
const run = promisify(execFile);
const maxBytes = 10 * 1024 * 1024;

@Injectable()
export class FilesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FilesService.name);
  readonly root = resolve(process.env.UPLOAD_STORAGE_PATH || './uploads');
  private readonly bucket = process.env.S3_BUCKET?.trim();
  private readonly prefix = (process.env.S3_PREFIX || 'invento').replace(/^\/+|\/+$/g, '');
  private readonly s3 = this.bucket ? new S3Client({ maxAttempts: 2, requestHandler: { requestTimeout: 5000, connectionTimeout: 3000 }, region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1', ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}) }) : undefined;
  private timer?: ReturnType<typeof setInterval>;
  private retrying = false;
  private readonly writes = new Map<string, Promise<StoredAttachment & { cloud: Manifest['cloud'] }>>();
  async onModuleInit() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (this.s3) { void this.retryCloudUploads(); this.timer = setInterval(() => void this.retryCloudUploads(), 60000); this.timer.unref(); }
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.s3?.destroy(); }
  private directory(businessId: string, id: string) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(businessId) || !/^[a-f0-9]{64}$/.test(id)) throw new BadRequestException('Invalid file reference.');
    return join(this.root, businessId, id);
  }
  private async manifest(businessId: string, id: string): Promise<Manifest> {
    try { return JSON.parse(await readFile(join(this.directory(businessId, id), 'metadata.json'), 'utf8')); }
    catch (error) { if (error instanceof BadRequestException) throw error; throw new NotFoundException('File not found in this business.'); }
  }
  private async writeManifest(dir: string, manifest: Manifest) {
    const temporary = join(dir, `metadata-${process.pid}-${Math.random().toString(36).slice(2)}.tmp`);
    await writeFile(temporary, JSON.stringify(manifest), { mode: 0o600 });
    await rename(temporary, join(dir, 'metadata.json'));
  }
  async store(businessId: string, file: { name: string; mimeType: string; base64: string }, kind: UploadKind): Promise<StoredAttachment & { cloud: Manifest['cloud'] }> {
    const key = createHash('sha256').update(JSON.stringify([businessId, kind, file.name, file.mimeType, file.base64])).digest('hex');
    const existing = this.writes.get(key);
    if (existing) return existing;
    const pending = this.persist(businessId, file, kind).finally(() => this.writes.delete(key));
    this.writes.set(key, pending);
    return pending;
  }
  private async persist(businessId: string, file: { name: string; mimeType: string; base64: string }, kind: UploadKind): Promise<StoredAttachment & { cloud: Manifest['cloud'] }> {
    if (!file.name?.trim() || file.name.length > 160 || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64) || file.base64.length > 13981016) throw new BadRequestException('Choose a valid file up to 10 MB.');
    if (kind !== 'purchase' && !file.mimeType.startsWith('image/')) throw new BadRequestException('Choose an image for this upload.');
    const bytes = Buffer.from(file.base64, 'base64');
    if (!bytes.length || bytes.length > maxBytes) throw new BadRequestException('Choose a file up to 10 MB.');
    const id = createHash('sha256').update(kind).update('\0').update(file.name).update('\0').update(file.mimeType).update('\0').update(bytes).digest('hex');
    const dir = this.directory(businessId, id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try { const existing = await this.manifest(businessId, id); await this.mirror(businessId, existing); return { name: existing.name, mimeType: existing.mimeType, url: existing.url, thumbnailUrl: existing.thumbnailUrl, cloud: existing.cloud }; } catch (error) { if (!(error instanceof NotFoundException)) throw error; }
    let original = bytes;
    let mimeType = file.mimeType;
    let thumbnail: Buffer;
    if (file.mimeType.startsWith('image/')) {
      try {
        const image = sharp(bytes, { limitInputPixels: 40000000, animated: false }).rotate();
        const metadata = await image.metadata();
        if (!['jpeg', 'png', 'webp', 'heif', 'avif', 'gif', 'tiff'].includes(metadata.format ?? '')) throw new Error('Unsupported image');
        original = await image.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
        thumbnail = await image.clone().resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true }).webp({ quality: 65 }).toBuffer();
        mimeType = 'image/webp';
      } catch { throw new BadRequestException('Could not process this image. Choose a valid image under 40 megapixels.'); }
    } else if (file.mimeType === 'application/pdf') {
      if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new BadRequestException('Choose a valid PDF.');
      // Only the first page is rendered, in a bounded subprocess. The PDF stays intact.
      const input = join(dir, 'original');
      await writeFile(input, bytes, { mode: 0o600 });
      try {
        await run('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '320', '-png', input, join(dir, 'preview')], { timeout: 15000, maxBuffer: 1024 * 1024 });
        thumbnail = await sharp(join(dir, 'preview.png')).webp({ quality: 65 }).toBuffer();
        const { unlink } = await import('node:fs/promises'); await unlink(join(dir, 'preview.png'));
      } catch { throw new BadRequestException('Could not generate the PDF preview. Check the PDF and ensure Poppler is installed on the server.'); }
    } else {
      if (kind !== 'purchase') throw new BadRequestException('Choose an image for this upload.');
      // Other reference files receive a small generic preview; never execute their content.
      thumbnail = await sharp(Buffer.from('<svg width="240" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="300" rx="16" fill="#edf4f0"/><path d="M65 50h80l30 30v165H65z" fill="white" stroke="#176b50" stroke-width="5"/><path d="M85 120h70m-70 30h70m-70 30h50" stroke="#176b50" stroke-width="6"/></svg>')).webp({ quality: 65 }).toBuffer();
    }
    await writeFile(join(dir, 'original'), original, { mode: 0o600 });
    await writeFile(join(dir, 'thumbnail'), thumbnail, { mode: 0o600 });
    const manifest: Manifest = { id, kind, name: mimeType === 'image/webp' ? `${file.name.replace(/\.[^.]+$/, '').slice(0, 155)}.webp` : file.name, mimeType, originalType: file.mimeType, size: original.length, url: `/files/${id}/original`, thumbnailUrl: `/files/${id}/thumbnail`, cloud: this.s3 ? 'pending' : 'disabled' };
    await this.writeManifest(dir, manifest);
    await this.mirror(businessId, manifest);
    return { name: manifest.name, mimeType, url: manifest.url, thumbnailUrl: manifest.thumbnailUrl, cloud: manifest.cloud };
  }
  async reference(businessId: string, value: string, kind: UploadKind, variant: 'original' | 'thumbnail' = 'original'): Promise<StoredAttachment> {
    const match = /^\/files\/([a-f0-9]{64})\/(original|thumbnail)$/.exec(value);
    if (!match || match[2] !== variant) throw new BadRequestException('Upload the file before saving its reference.');
    const file = await this.manifest(businessId, match[1]);
    if (file.kind !== kind) throw new BadRequestException('This file belongs to a different upload type.');
    return { name: file.name, mimeType: file.mimeType, url: file.url, thumbnailUrl: file.thumbnailUrl };
  }
  async image(businessId: string, value: string, kind: UploadKind): Promise<StoredAttachment> {
    if (!value.startsWith('data:')) return this.reference(businessId, value, kind);
    const match = /^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) throw new BadRequestException('Choose a valid image.');
    return this.store(businessId, { name: `${kind}-photo`, mimeType: match[1], base64: match[2] }, kind);
  }
  async read(businessId: string, id: string, variant: string) {
    if (!['original', 'thumbnail'].includes(variant)) throw new NotFoundException('File not found.');
    const manifest = await this.manifest(businessId, id);
    let data: Buffer;
    try { data = await readFile(join(this.directory(businessId, id), variant)); }
    catch {
      if (!this.s3 || manifest.cloud !== 'uploaded') throw new NotFoundException('File unavailable.');
      const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(businessId, id, variant) }));
      if (!result.Body) throw new NotFoundException('File unavailable.');
      data = Buffer.from(await result.Body.transformToByteArray());
    }
    return { data, manifest, mimeType: variant === 'thumbnail' ? 'image/webp' : manifest.mimeType };
  }
  private key(businessId: string, id: string, variant: string) { return [this.prefix, businessId, id, variant].filter(Boolean).join('/'); }
  private async mirror(businessId: string, manifest: Manifest) {
    if (!this.s3 || manifest.cloud === 'uploaded') return;
    try {
      manifest.cloud = 'pending';
      const dir = this.directory(businessId, manifest.id);
      await this.writeManifest(dir, manifest);
      await Promise.all(['original', 'thumbnail'].map(async (variant) => this.s3!.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.key(businessId, manifest.id, variant), Body: await readFile(join(dir, variant)), ContentType: variant === 'thumbnail' ? 'image/webp' : manifest.mimeType }))));
      manifest.cloud = 'uploaded'; await this.writeManifest(dir, manifest);
    } catch { this.logger.warn(`S3 upload pending for ${manifest.id}; local files retained for retry.`); }
  }
  async retryCloudUploads() {
    if (!this.s3 || this.retrying) return;
    this.retrying = true;
    try {
      for (const business of await readdir(this.root, { withFileTypes: true })) {
        if (!business.isDirectory() || !/^[A-Za-z0-9_-]{1,100}$/.test(business.name)) continue;
        for (const asset of await readdir(join(this.root, business.name), { withFileTypes: true })) {
          if (!asset.isDirectory() || !/^[a-f0-9]{64}$/.test(asset.name)) continue;
          try { const manifest = await this.manifest(business.name, asset.name); if (manifest.cloud !== 'uploaded') await this.mirror(business.name, manifest); } catch { /* Incomplete uploads have no published manifest. */ }
        }
      }
    } catch { this.logger.warn('Could not scan local uploads for S3 retry.'); }
    finally { this.retrying = false; }
  }
}
