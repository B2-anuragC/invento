import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { type SellingOptionDto, productStatuses } from './dto/product.dto.js';

type ProductInput = {
  gstRate?: string;
  name?: string;
  sku?: string;
  barcode?: string;
  category?: string;
  unit?: string;
  piecesPerUnit?: number;
  sellingOptions?: SellingOptionDto[];
  purchasePrice?: string;
  sellingPrice?: string;
  minimumStock?: string;
  status?: (typeof productStatuses)[number];
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly inventory: InventoryService) {}

  async create(userId: string, businessId: string, input: Required<Pick<ProductInput, 'name' | 'sku' | 'unit' | 'purchasePrice' | 'sellingPrice' | 'minimumStock'>> & Pick<ProductInput, 'barcode' | 'category' | 'piecesPerUnit' | 'sellingOptions' | 'gstRate'>) {
    await this.requireManagerMembership(userId, businessId);
    const piecesPerUnit = this.groupSize(input.unit, input.piecesPerUnit);
    const sellingOptions = this.validateOptions(input.sellingOptions ?? [], input.unit, piecesPerUnit);
    try {
      return await this.prisma.product.create({
        data: {
          businessId,
          name: input.name.trim(),
          sku: input.sku.trim().toUpperCase(),
          barcode: input.barcode?.trim() || null,
          category: input.category?.trim() || null,
          unit: input.unit,
          piecesPerUnit,
          sellingOptions,
          gstRate: input.gstRate ?? '0',
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
    const product = await this.requireProduct(businessId, productId);
    const unit = input.unit ?? product.unit;
    const piecesPerUnit = this.groupSize(unit, input.piecesPerUnit ?? (unit === product.unit ? product.piecesPerUnit ?? undefined : undefined));
    if (unit !== product.unit || piecesPerUnit !== product.piecesPerUnit) {
      const inventory = await this.prisma.inventory.findUnique({ where: { productId } });
      const history = await this.prisma.inventoryTransaction.count({ where: { productId } });
      if (inventory || history) throw new ConflictException('Stock unit and pieces per unit cannot change after opening stock. Create a separate product for a different package size.');
    }
    const sellingOptions = input.sellingOptions === undefined ? undefined : this.validateOptions(input.sellingOptions, unit, piecesPerUnit);
    try {
      return await this.prisma.product.update({
        where: { id: productId },
        data: {
          ...input,
          sellingOptions,
          piecesPerUnit,
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

  private validateOptions(options: SellingOptionDto[], unit: string, size: number | null): Prisma.InputJsonArray {
    const ids = new Set<string>();
    if (options.length > 20) throw new BadRequestException('Use at most 20 selling options.');
    return options.map((option) => {
      if (ids.has(option.id)) throw new BadRequestException('Selling option identifiers must be unique.');
      ids.add(option.id);
      if (option.unit !== unit && !(option.unit === 'PIECE' && size)) throw new BadRequestException('Selling options must use the stock unit, or pieces for a configured group.');
      const quantity = new Prisma.Decimal(option.quantity);
      const price = new Prisma.Decimal(option.sellingPrice);
      if (!quantity.isFinite() || quantity.lte(0) || !price.isFinite() || price.lte(0)) throw new BadRequestException('Selling option quantity and price must be positive.');
      const pieces = quantity.times(option.unit === 'PIECE' ? 1 : size ?? 1);
      if ((size || unit === 'PIECE') && !pieces.isInteger()) throw new BadRequestException('Selling options must represent whole pieces.');
      return { id: option.id, name: option.name.trim(), unit: option.unit, quantity: quantity.toString(), sellingPrice: price.toFixed(2) };
    });
  }

  private groupSize(unit: string, size?: number): number | null {
    if (unit === 'DOZEN') {
      if (size !== undefined && size !== 12) throw new BadRequestException('A dozen contains 12 pieces.');
      return 12;
    }
    if (size !== undefined && (!['BOX', 'PACK'].includes(unit) || !Number.isInteger(size) || size < 1 || size > 100000)) throw new BadRequestException('Pieces per unit must be a whole number from 1 to 100000 for boxes or packs.');
    return size ?? null;
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
