import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, PaymentMethod, Prisma, ProductStatus, CustomerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';

type SaleItemInput = {
  productId: string;
  quantity: string;
  sellingPrice: string;
};

type CreateSaleInput = {
  customerId: string;
  invoiceNumber?: string;
  saleDate: string;
  paymentMethod: PaymentMethod;
  note?: string;
  items: SaleItemInput[];
};

type UpdateSaleInput = {
  invoiceNumber?: string;
  saleDate?: string;
  note?: string;
};

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService, private readonly inventory: InventoryService) {}

  async create(userId: string, businessId: string, input: CreateSaleInput) {
    await this.requireManagerMembership(userId, businessId);

    const customer = await this.prisma.customer.findFirst({ where: { id: input.customerId, businessId } });
    if (!customer) throw new NotFoundException('Customer not found.');
    if (customer.status !== CustomerStatus.ACTIVE) throw new ConflictException('Customer is not active.');

    if (input.items.length === 0) throw new BadRequestException('At least one sale item is required.');
    if (!Object.values(PaymentMethod).includes(input.paymentMethod)) throw new BadRequestException('Invalid payment method.');

    const seen = new Set<string>();
    const lines = input.items.map((item) => {
      if (seen.has(item.productId)) throw new BadRequestException('Duplicate product in sale items.');
      seen.add(item.productId);

      if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(item.quantity) || !/^\d{1,10}(?:\.\d{1,2})?$/.test(item.sellingPrice)) {
        throw new BadRequestException('Invalid sale quantity or selling price precision.');
      }
      const quantity = new Prisma.Decimal(item.quantity);
      const sellingPrice = new Prisma.Decimal(item.sellingPrice);
      if (quantity.lessThanOrEqualTo(0)) throw new BadRequestException('Sale item quantity must be greater than zero.');
      if (sellingPrice.lessThanOrEqualTo(0)) throw new BadRequestException('Sale item price must be greater than zero.');

      const lineTotal = quantity.times(sellingPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return { productId: item.productId, quantity, sellingPrice, lineTotal };
    });

    const products = await this.prisma.product.findMany({ where: { businessId, id: { in: lines.map((line) => line.productId) } } });
    const productsById = new Map(products.map((product) => [product.id, product]));
    for (const line of lines) {
      const product = productsById.get(line.productId);
      if (!product) throw new NotFoundException(`Product ${line.productId} not found in this business.`);
      if (product.status !== ProductStatus.ACTIVE) throw new ConflictException(`Product ${product.name} is not active.`);
    }

    const total = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    if (total.greaterThan('999999999999.99')) throw new BadRequestException('Sale total exceeds the supported range.');
    const saleDate = new Date(input.saleDate);
    if (Number.isNaN(saleDate.getTime())) throw new BadRequestException('Invalid sale date.');

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          businessId,
          customerId: input.customerId,
          invoiceNumber: input.invoiceNumber,
          saleDate,
          paymentMethod: input.paymentMethod,
          total,
          note: input.note,
          createdByUserId: userId,
        },
      });

      // Stable lock ordering avoids deadlocks between multi-product sales.
      for (const line of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        // The inventory engine checks the locked balance before this item's
        // insert. All writes remain provisional until the outer commit.
        await this.inventory.applyMovement(
          {
            businessId,
            productId: line.productId,
            type: InventoryTransactionType.SALE,
            quantity: line.quantity,
            note: `Sale ${sale.id}`,
            userId,
          },
          tx,
        );
        await tx.saleItem.create({
          data: { saleId: sale.id, productId: line.productId, quantity: line.quantity, sellingPrice: line.sellingPrice, lineTotal: line.lineTotal },
        });
      }

      return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true, customer: true } });
    });
  }

  async list(userId: string, businessId: string, query: { customerId?: string; search?: string }) {
    await this.requireMembership(userId, businessId);
    return this.prisma.sale.findMany({
      where: {
        businessId,
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.search ? { invoiceNumber: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      include: { customer: { select: { id: true, name: true } }, items: true },
      orderBy: { saleDate: 'desc' },
    });
  }

  async get(userId: string, businessId: string, saleId: string) {
    await this.requireMembership(userId, businessId);
    return this.requireSale(businessId, saleId);
  }

  /**
   * Updates sale metadata only (invoice number, sale date, note).
   *
   * Line items, quantities, and prices cannot be edited once a sale has
   * been created, because inventory transactions have already been applied
   * for those items and editing them after the fact could silently corrupt
   * historical stock levels. See ADR-011: corrections require an explicit
   * audited adjustment or a future reversal flow, not editing settled items.
   */
  async update(userId: string, businessId: string, saleId: string, input: UpdateSaleInput) {
    await this.requireManagerMembership(userId, businessId);
    await this.requireSale(businessId, saleId);

    const saleDate = input.saleDate ? new Date(input.saleDate) : undefined;
    if (saleDate && Number.isNaN(saleDate.getTime())) throw new BadRequestException('Invalid sale date.');

    return this.prisma.sale.update({
      where: { id: saleId },
      data: { invoiceNumber: input.invoiceNumber, saleDate, note: input.note },
      include: { items: true, customer: true },
    });
  }

  private async requireSale(businessId: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, businessId },
      include: { items: true, customer: true },
    });
    if (!sale) throw new NotFoundException('Sale not found.');
    return sale;
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
}
