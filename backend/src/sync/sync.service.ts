import { FilesService } from '../files/files.service.js';
import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductsService } from '../products/products.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { SuppliersService } from '../suppliers/suppliers.service.js';
import { PurchasesService } from '../purchases/purchases.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { CreateProductDto, UpdateProductDto } from '../products/dto/product.dto.js';
import { CreateCustomerDto, UpdateCustomerDto } from '../customers/dto/customer.dto.js';
import { CreateSupplierDto, UpdateSupplierDto } from '../suppliers/dto/supplier.dto.js';
import { OpeningStockDto } from '../inventory/dto/inventory.dto.js';
import { globalValidationPipe } from '../common/pipes/validation.pipe.js';
import { SyncCommandDto } from './sync.dto.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService, private readonly files?: FilesService) {}

  async snapshot(userId: string, businessId: string) {
    return this.prisma.$transaction(async (tx) => {
      const membership = await this.membership(tx, userId, businessId);
      const business = await tx.business.findUniqueOrThrow({ where: { id: businessId } });
      const products = await tx.product.findMany({ where: { businessId } });
      const visibleProducts = membership.role === 'MEMBER' && !business.membersCanViewPurchasePrice
        ? products.map(({ purchasePrice: _price, ...product }) => product) : products;
      const inventory = new InventoryService(tx as PrismaService);
      const sales = await tx.sale.findMany({ where: { businessId }, include: { payments: true, customer: true, items: { include: { product: { select: { name: true, sku: true, unit: true } } } } }, orderBy: { saleDate: 'desc' } });
      const purchases = await tx.purchase.findMany({ where: { businessId }, include: { payments: true, supplier: true, items: { include: { product: { select: { name: true, sku: true, unit: true } } } } }, orderBy: { purchaseDate: 'desc' } });
      return {
        sales, purchases: await new PurchasesService(tx as PrismaService, inventory).applyPriceVisibility(businessId, membership, purchases),
        schemaVersion: 1, business: { id: business.id, name: business.name },
        access: { role: membership.role, membersCanViewPurchasePrice: business.membersCanViewPurchasePrice },
        products: visibleProducts,
        customers: await tx.customer.findMany({ where: { businessId } }),
        suppliers: await tx.supplier.findMany({ where: { businessId } }),
        inventory: await inventory.list(userId, businessId),
        inventoryActivity: await inventory.activity(userId, businessId),
        downloadedAt: new Date().toISOString(),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async push(userId: string, businessId: string, command: SyncCommandDto) {
    if (command.entity === 'opening-stock' && command.action !== 'create') throw new BadRequestException('Opening stock can only be created.');
    const dto = command.entity === 'products' ? (command.action === 'create' ? CreateProductDto : UpdateProductDto)
      : command.entity === 'customers' ? (command.action === 'create' ? CreateCustomerDto : UpdateCustomerDto)
      : command.entity === 'suppliers' ? (command.action === 'create' ? CreateSupplierDto : UpdateSupplierDto) : OpeningStockDto;
    const payload = await globalValidationPipe.transform(command.payload, { type: 'body', metatype: dto });
    const hash = createHash('sha256').update(canonical(command)).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const membership = await this.membership(tx, userId, businessId);
      if (membership.role === 'MEMBER') throw new ForbiddenException('Only owners and administrators can upload changes.');
      // Serializes duplicate operation IDs even before their deduplication row exists.
      await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${businessId}:${command.operationId}`}, 0))`);
      const existing = await tx.syncOperation.findUnique({ where: { businessId_operationId: { businessId, operationId: command.operationId } } });
      if (existing) {
        if (existing.payloadHash !== hash || existing.userId !== userId) throw new ConflictException('Operation identifier has already been used for different content.');
        return existing.result;
      }
      if (command.action === 'update') {
        if (!command.baseRevision) throw new BadRequestException('Updates require a base revision.');
        const rows = await tx.$queryRaw<{ revision: number }[]>(Prisma.sql`SELECT revision FROM ${Prisma.raw(command.entity)} WHERE id = ${command.entityId} AND "businessId" = ${businessId} FOR UPDATE`);
        if (!rows[0]) throw new NotFoundException('Record not found in this business.');
        if (rows[0].revision !== command.baseRevision) throw new ConflictException('This record changed on another device. Review your changes before syncing.');
      }
      const scoped = tx as PrismaService;
      const inventory = new InventoryService(scoped);
      let record: unknown;
      if (command.entity === 'products') {
        const service = new ProductsService(scoped, inventory, this.files);
        record = command.action === 'create' ? await service.create(userId, businessId, payload, command.entityId) : await service.update(userId, businessId, command.entityId, payload);
      } else if (command.entity === 'customers') {
        const service = new CustomersService(scoped, this.files);
        record = command.action === 'create' ? await service.create(userId, businessId, payload, command.entityId) : await service.update(userId, businessId, command.entityId, payload);
      } else if (command.entity === 'suppliers') {
        const service = new SuppliersService(scoped);
        record = command.action === 'create' ? await service.create(userId, businessId, payload, command.entityId) : await service.update(userId, businessId, command.entityId, payload);
      } else {
        record = await inventory.recordOpeningStock({ businessId, userId, ...payload }, tx);
      }
      const result = JSON.parse(JSON.stringify({ operationId: command.operationId, entity: command.entity, entityId: command.entityId, record })) as Prisma.InputJsonObject;
      await tx.syncOperation.create({ data: { businessId, operationId: command.operationId, userId, payloadHash: hash, result } });
      return result;
    });
  }

  private async membership(tx: Prisma.TransactionClient, userId: string, businessId: string) {
    const membership = await tx.businessUser.findUnique({ where: { businessId_userId: { businessId, userId } } });
    if (!membership?.isActive) throw new ForbiddenException('You do not have access to this business.');
    return membership;
  }
}
