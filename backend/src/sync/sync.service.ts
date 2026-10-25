import {
  requireBusinessMembership,
  requireBusinessPermission,
} from '../auth/business-access.js';
import { FilesService } from '../files/files.service.js';
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductsService } from '../products/products.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { SuppliersService } from '../suppliers/suppliers.service.js';
import { PurchasesService } from '../purchases/purchases.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import {
  CreateProductDto,
  UpdateProductDto,
} from '../products/dto/product.dto.js';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
} from '../customers/dto/customer.dto.js';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from '../suppliers/dto/supplier.dto.js';
import { OpeningStockDto } from '../inventory/dto/inventory.dto.js';
import { globalValidationPipe } from '../common/pipes/validation.pipe.js';
import { SyncCommandDto } from './sync.dto.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files?: FilesService,
  ) {}

  async snapshot(userId: string, businessId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const membership = await this.membership(tx, userId, businessId);
        const business = await tx.business.findUniqueOrThrow({
          where: { id: businessId },
        });
        const products = await tx.product.findMany({ where: { businessId } });
        const visibleProducts = !membership.permissions.includes('pricing.view')
          ? products.map(({ purchasePrice: _price, ...product }) => product)
          : products;
        const inventory = new InventoryService(tx as PrismaService);
        const sales = await tx.sale.findMany({
          where: { businessId },
          include: {
            payments: true,
            customer: true,
            items: {
              include: {
                product: { select: { name: true, sku: true, unit: true } },
              },
            },
          },
          orderBy: { saleDate: 'desc' },
        });
        const purchases = await tx.purchase.findMany({
          where: { businessId },
          include: {
            payments: true,
            supplier: true,
            items: {
              include: {
                product: { select: { name: true, sku: true, unit: true } },
              },
            },
          },
          orderBy: { purchaseDate: 'desc' },
        });
        return {
          sales: membership.permissions.includes('sales.view') ? sales : [],
          purchases: membership.permissions.includes('purchases.view')
            ? await new PurchasesService(
                tx as PrismaService,
                inventory,
              ).applyPriceVisibility(businessId, membership, purchases)
            : [],
          schemaVersion: 1,
          business: { id: business.id, name: business.name },
          access: {
            role: membership.role,
            membersCanViewPurchasePrice:
              membership.permissions.includes('pricing.view'),
            permissions: membership.permissions,
          },
          products: membership.permissions.includes('products.view')
            ? visibleProducts
            : [],
          customers: membership.permissions.includes('customers.view')
            ? await tx.customer.findMany({ where: { businessId } })
            : [],
          suppliers: membership.permissions.includes('suppliers.view')
            ? await tx.supplier.findMany({ where: { businessId } })
            : [],
          inventory: membership.permissions.includes('inventory.view')
            ? await inventory.list(userId, businessId)
            : [],
          inventoryActivity: membership.permissions.includes('inventory.view')
            ? await inventory.activity(userId, businessId)
            : [],
          downloadedAt: new Date().toISOString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async push(userId: string, businessId: string, command: SyncCommandDto) {
    if (command.entity === 'opening-stock' && command.action !== 'create')
      throw new BadRequestException('Opening stock can only be created.');
    const dto =
      command.entity === 'products'
        ? command.action === 'create'
          ? CreateProductDto
          : UpdateProductDto
        : command.entity === 'customers'
          ? command.action === 'create'
            ? CreateCustomerDto
            : UpdateCustomerDto
          : command.entity === 'suppliers'
            ? command.action === 'create'
              ? CreateSupplierDto
              : UpdateSupplierDto
            : OpeningStockDto;
    const payload = await globalValidationPipe.transform(command.payload, {
      type: 'body',
      metatype: dto,
    });
    const hash = createHash('sha256').update(canonical(command)).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const membership = await this.membership(tx, userId, businessId);
      const visibleResult = (value: Prisma.JsonValue) => {
        if (
          command.entity !== 'products' ||
          membership.permissions.includes('pricing.view') ||
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value)
        )
          return value;
        const result = JSON.parse(
          JSON.stringify(value),
        ) as Prisma.InputJsonObject;
        if (
          result.record &&
          typeof result.record === 'object' &&
          !Array.isArray(result.record)
        )
          delete (result.record as Record<string, unknown>).purchasePrice;
        return result;
      };
      await requireBusinessPermission(
        tx as PrismaService,
        userId,
        businessId,
        command.entity === 'opening-stock'
          ? 'inventory.adjust'
          : `${command.entity}.${command.action}`,
      );
      // Serializes duplicate operation IDs even before their deduplication row exists.
      await tx.$queryRaw(
        Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${businessId}:${command.operationId}`}, 0))`,
      );
      const existing = await tx.syncOperation.findUnique({
        where: {
          businessId_operationId: {
            businessId,
            operationId: command.operationId,
          },
        },
      });
      if (existing) {
        if (existing.payloadHash !== hash || existing.userId !== userId)
          throw new ConflictException(
            'Operation identifier has already been used for different content.',
          );
        return visibleResult(existing.result);
      }
      if (command.action === 'update') {
        if (!command.baseRevision)
          throw new BadRequestException('Updates require a base revision.');
        const rows = await tx.$queryRaw<{ revision: number }[]>(
          Prisma.sql`SELECT revision FROM ${Prisma.raw(command.entity)} WHERE id = ${command.entityId} AND "businessId" = ${businessId} FOR UPDATE`,
        );
        if (!rows[0])
          throw new NotFoundException('Record not found in this business.');
        if (rows[0].revision !== command.baseRevision)
          throw new ConflictException(
            'This record changed on another device. Review your changes before syncing.',
          );
      }
      const scoped = tx as PrismaService;
      const inventory = new InventoryService(scoped);
      let record: unknown;
      if (command.entity === 'products') {
        const service = new ProductsService(scoped, inventory, this.files);
        record =
          command.action === 'create'
            ? await service.create(
                userId,
                businessId,
                payload,
                command.entityId,
              )
            : await service.update(
                userId,
                businessId,
                command.entityId,
                payload,
              );
      } else if (command.entity === 'customers') {
        const service = new CustomersService(scoped, this.files);
        record =
          command.action === 'create'
            ? await service.create(
                userId,
                businessId,
                payload,
                command.entityId,
              )
            : await service.update(
                userId,
                businessId,
                command.entityId,
                payload,
              );
      } else if (command.entity === 'suppliers') {
        const service = new SuppliersService(scoped);
        record =
          command.action === 'create'
            ? await service.create(
                userId,
                businessId,
                payload,
                command.entityId,
              )
            : await service.update(
                userId,
                businessId,
                command.entityId,
                payload,
              );
      } else {
        const product = await tx.product.findFirst({
          where: { id: payload.productId, businessId },
          select: { id: true },
        });
        if (!product)
          throw new NotFoundException('Product not found in this business.');
        record = await inventory.recordOpeningStock(
          { businessId, userId, ...payload },
          tx,
        );
      }
      const result = JSON.parse(
        JSON.stringify({
          operationId: command.operationId,
          entity: command.entity,
          entityId: command.entityId,
          record,
        }),
      ) as Prisma.InputJsonObject;
      await tx.syncOperation.create({
        data: {
          businessId,
          operationId: command.operationId,
          userId,
          payloadHash: hash,
          result,
        },
      });
      return visibleResult(result as Prisma.JsonValue);
    });
  }

  private async membership(
    tx: Prisma.TransactionClient,
    userId: string,
    businessId: string,
  ) {
    return requireBusinessMembership(tx as PrismaService, userId, businessId);
  }
}
