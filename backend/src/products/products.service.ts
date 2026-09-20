import { ConflictException, ForbiddenException, Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { productStatuses } from './dto/product.dto.js';

type ProductInput = {
  name?: string;
  sku?: string;
  barcode?: string;
  unit?: string;
  purchasePrice?: string;
  sellingPrice?: string;
  minimumStock?: string;
  status?: (typeof productStatuses)[number];
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, businessId: string, input: Required<Pick<ProductInput, 'name' | 'sku' | 'unit' | 'purchasePrice' | 'sellingPrice' | 'minimumStock'>> & Pick<ProductInput, 'barcode'>) {
    await this.requireManagerMembership(userId, businessId);
    try {
      return await this.prisma.product.create({
        data: {
          businessId,
          name: input.name.trim(),
          sku: input.sku.trim().toUpperCase(),
          barcode: input.barcode?.trim() || null,
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

  async list(userId: string, businessId: string, query: { search?: string; status?: (typeof productStatuses)[number] }) {
    await this.requireMembership(userId, businessId);
    const search = query.search?.trim();
    return this.prisma.product.findMany({
      where: {
        businessId,
        status: query.status ? this.toStatus(query.status) : ProductStatus.ACTIVE,
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search.toUpperCase(), mode: 'insensitive' } }, { barcode: { contains: search, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async search(userId: string, businessId: string, query: { search?: string; status?: (typeof productStatuses)[number] }) {
    return this.list(userId, businessId, query);
  }

  async get(userId: string, businessId: string, productId: string) {
    await this.requireMembership(userId, businessId);
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
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

  async stock(userId: string, businessId: string, productId: string): Promise<never> {
    await this.requireProductAccess(userId, businessId, productId);
    throw new NotImplementedException('Inventory stock is available in Phase 4.');
  }

  async transactions(userId: string, businessId: string, productId: string): Promise<never> {
    await this.requireProductAccess(userId, businessId, productId);
    throw new NotImplementedException('Inventory transactions are available in Phase 4.');
  }

  private async requireProductAccess(userId: string, businessId: string, productId: string) {
    await this.requireMembership(userId, businessId);
    return this.requireProduct(businessId, productId);
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

  private toStatus(status: (typeof productStatuses)[number]) {
    return status === 'ACTIVE' ? ProductStatus.ACTIVE : ProductStatus.INACTIVE;
  }

  private throwIfUniqueViolation(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A product with this SKU or barcode already exists in this business.');
    }
  }
}
