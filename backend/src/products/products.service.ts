import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { productStatuses } from './dto/product.dto.js';

type ProductInput = {
  name?: string;
  sku?: string;
  barcode?: string;
  category?: string;
  unit?: string;
  purchasePrice?: string;
  sellingPrice?: string;
  minimumStock?: string;
  status?: (typeof productStatuses)[number];
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly inventory: InventoryService) {}

  async create(userId: string, businessId: string, input: Required<Pick<ProductInput, 'name' | 'sku' | 'unit' | 'purchasePrice' | 'sellingPrice' | 'minimumStock'>> & Pick<ProductInput, 'barcode' | 'category'>) {
    await this.requireManagerMembership(userId, businessId);
    try {
      return await this.prisma.product.create({
        data: {
          businessId,
          name: input.name.trim(),
          sku: input.sku.trim().toUpperCase(),
          barcode: input.barcode?.trim() || null,
          category: input.category?.trim() || null,
          unit: input.unit,
          purchasePrice: input.purchasePrice,
          sellingPrice: input.sellingPrice,
          minimumStock: input.minimumStock,
        },
      });
    } catch (error) {
      this.throwIfUniqueViolation(error);
      throw error;
    }
  }

  async list(userId: string, businessId: string, query: { search?: string; status?: (typeof productStatuses)[number]; category?: string }) {
    const membership = await this.requireMembership(userId, businessId);
    const search = query.search?.trim();
    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        status: query.status ? this.toStatus(query.status) : ProductStatus.ACTIVE,
        ...(query.category ? { category: query.category } : {}),
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search.toUpperCase(), mode: 'insensitive' } }, { barcode: { contains: search, mode: 'insensitive' } }, { category: { contains: search, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
    return this.applyPurchasePriceVisibility(businessId, membership, products);
  }

  async search(userId: string, businessId: string, query: { search?: string; status?: (typeof productStatuses)[number] }) {
    return this.list(userId, businessId, query);
  }

  async categories(userId: string, businessId: string) {
    await this.requireMembership(userId, businessId);
    const products = await this.prisma.product.findMany({
      where: { businessId, status: ProductStatus.ACTIVE, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return products.flatMap(({ category }) => category ? [category] : []);
  }

  async get(userId: string, businessId: string, productId: string) {
    const membership = await this.requireMembership(userId, businessId);
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) throw new NotFoundException('Product not found.');
    return (await this.applyPurchasePriceVisibility(businessId, membership, [product]))[0];
  }

  async update(userId: string, businessId: string, productId: string, input: ProductInput) {
    await this.requireManagerMembership(userId, businessId);
    await this.requireProduct(businessId, productId);
    try {
      return await this.prisma.product.update({
        where: { id: productId },
        data: {
          ...input,
          name: input.name?.trim(),
          sku: input.sku?.trim().toUpperCase(),
          barcode: input.barcode === undefined ? undefined : input.barcode.trim() || null,
          category: input.category === undefined ? undefined : input.category.trim() || null,
          purchasePrice: input.purchasePrice,
          sellingPrice: input.sellingPrice,
          minimumStock: input.minimumStock,
          status: input.status ? this.toStatus(input.status) : undefined,
        },
      });
    } catch (error) {
      this.throwIfUniqueViolation(error);
      throw error;
    }
  }

  async deactivate(userId: string, businessId: string, productId: string) {
    await this.requireManagerMembership(userId, businessId);
    await this.requireProduct(businessId, productId);
    return this.prisma.product.update({ where: { id: productId }, data: { status: ProductStatus.INACTIVE } });
  }

  async stock(userId: string, businessId: string, productId: string) {
    return this.inventory.get(userId, businessId, productId);
  }

  async transactions(userId: string, businessId: string, productId: string) {
    return this.inventory.history(userId, businessId, productId);
  }

  private async requireProduct(businessId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  private async requireMembership(userId: string, businessId: string) {
    const membership = await this.prisma.businessUser.findUnique({ where: { businessId_userId: { businessId, userId } } });
    if (!membership?.isActive) throw new ForbiddenException('You do not have access to this business.');
    return membership;
  }

  private async requireManagerMembership(userId: string, businessId: string) {
    const membership = await this.requireMembership(userId, businessId);
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') throw new ForbiddenException('You do not have permission for this action.');
    return membership;
  }

  private async applyPurchasePriceVisibility<T extends { purchasePrice: unknown }>(
    businessId: string,
    membership: { role: string },
    products: T[],
  ): Promise<(Omit<T, 'purchasePrice'> & { purchasePrice?: T['purchasePrice'] })[]> {
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') return products;
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { membersCanViewPurchasePrice: true },
    });
    if (business?.membersCanViewPurchasePrice !== false) return products;
    return products.map(({ purchasePrice: _purchasePrice, ...product }) => product);
  }

  private toStatus(status: (typeof productStatuses)[number]) {
    return status === 'ACTIVE' ? ProductStatus.ACTIVE : ProductStatus.INACTIVE;
  }

  private throwIfUniqueViolation(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A product with this SKU or barcode already exists in this business.');
    }
  }
}
