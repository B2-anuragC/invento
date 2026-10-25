import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { FilesService } from './files.service.js';

@Injectable()
export class FileMigrationService implements OnModuleInit {
  private readonly logger = new Logger(FileMigrationService.name);
  constructor(private readonly prisma: PrismaService, private readonly files: FilesService) {}
  // Files are published before database references change. Content-derived IDs
  // make a restart after a partial migration safe without duplicate uploads.
  async onModuleInit() {
    if (process.env.UPLOAD_MIGRATE_LEGACY === 'false') return;
    let converted = 0;
    for (;;) {
      const products = await this.prisma.product.findMany({ where: { imageOriginal: { startsWith: 'data:' } }, take: 25 });
      if (!products.length) break;
      for (const product of products) {
        const file = await this.files.image(product.businessId, product.imageOriginal!, 'product');
        await this.prisma.product.update({ where: { id: product.id }, data: { imageOriginal: file.url, imageThumbnail: file.thumbnailUrl } }); converted++;
      }
    }
    for (;;) {
      const sales = await this.prisma.sale.findMany({ where: { referenceImage: { startsWith: 'data:' } }, take: 25 });
      if (!sales.length) break;
      for (const sale of sales) {
        const file = await this.files.image(sale.businessId, sale.referenceImage!, 'sale');
        await this.prisma.sale.update({ where: { id: sale.id }, data: { referenceImage: file.url } }); converted++;
      }
    }
    // JSON attachments and historical idempotency responses may still contain
    // legacy bytes; scan in bounded pages so they cannot reintroduce base64.
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.purchase.findMany({ take: 25, orderBy: { id: 'asc' }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!rows.length) break;
      for (const row of rows) {
        const attachment = row.attachment as { name?: string; mimeType?: string; base64?: string } | null;
        if (attachment?.base64) {
          const file = await this.files.store(row.businessId, { name: attachment.name!, mimeType: attachment.mimeType!, base64: attachment.base64 }, 'purchase');
          await this.prisma.purchase.update({ where: { id: row.id }, data: { attachment: { name: file.name, mimeType: file.mimeType, url: file.url, thumbnailUrl: file.thumbnailUrl } } }); converted++;
        }
      }
      cursor = rows.at(-1)!.id;
    }
    let skip = 0;
    for (;;) {
      const rows = await this.prisma.syncOperation.findMany({ take: 25, skip, orderBy: [{ businessId: 'asc' }, { operationId: 'asc' }] });
      if (!rows.length) break;
      for (const row of rows) {
        if (!JSON.stringify(row.result).includes('base64')) continue;
        const result = await this.convert(row.businessId, row.result);
        await this.prisma.syncOperation.update({ where: { businessId_operationId: { businessId: row.businessId, operationId: row.operationId } }, data: { result: result as Prisma.InputJsonValue } });
      }
      skip += rows.length;
    }
    if (converted) this.logger.log(`Moved ${converted} legacy uploads to physical file storage.`);
  }
  private async convert(businessId: string, value: unknown): Promise<unknown> {
    if (Array.isArray(value)) return Promise.all(value.map((entry) => this.convert(businessId, entry)));
    if (!value || typeof value !== 'object') return value;
    const record: Record<string, unknown> = { ...value };
    if (typeof record.imageOriginal === 'string' && record.imageOriginal.startsWith('data:')) {
      const file = await this.files.image(businessId, record.imageOriginal, 'product'); record.imageOriginal = file.url; record.imageThumbnail = file.thumbnailUrl;
    }
    if (typeof record.referenceImage === 'string' && record.referenceImage.startsWith('data:')) record.referenceImage = (await this.files.image(businessId, record.referenceImage, 'sale')).url;
    if (typeof record.base64 === 'string' && typeof record.name === 'string' && typeof record.mimeType === 'string') {
      const file = await this.files.store(businessId, { name: record.name, mimeType: record.mimeType, base64: record.base64 }, 'purchase');
      return { name: file.name, mimeType: file.mimeType, url: file.url, thumbnailUrl: file.thumbnailUrl };
    }
    for (const key of Object.keys(record)) if (typeof record[key] === 'object') record[key] = await this.convert(businessId, record[key]);
    return record;
  }
}
