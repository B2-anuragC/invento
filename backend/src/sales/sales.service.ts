import { taxFor, paidAmount, dueDateFor, recordTransactionPayment } from '../common/transaction-accounting.js';
import type { RecordPaymentDto } from '../common/dto/transaction-finance.dto.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, PaymentMethod, Prisma, ProductStatus, CustomerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';

type SaleItemInput = {
  productId: string;
  unit?: string;
  sellingOptionId?: string;
  quantity: string;
  sellingPrice: string;
};

type CreateSaleInput = {
  amountPaid?: string;
  dueDate?: string;
  requestId?: string;
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
    if (input.requestId) {
      const existing = await this.prisma.sale.findUnique({ where: { businessId_requestId: { businessId, requestId: input.requestId } }, include: { items: true, payments: true, customer: true } });
      if (existing) return existing;
    }

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
      return { productId: item.productId, unit: item.unit, sellingOptionId: item.sellingOptionId, optionName: undefined as string | undefined, unitsPerOption: new Prisma.Decimal(1), gstRate: new Prisma.Decimal(0), taxAmount: new Prisma.Decimal(0), quantity, sellingPrice, lineTotal };
    });

    const products = await this.prisma.product.findMany({ where: { businessId, id: { in: lines.map((line) => line.productId) } } });
    const productsById = new Map(products.map((product) => [product.id, product]));
    for (const line of lines) {
      const product = productsById.get(line.productId);
      if (!product) throw new NotFoundException(`Product ${line.productId} not found in this business.`);
      if (product.status !== ProductStatus.ACTIVE) throw new ConflictException(`Product ${product.name} is not active.`);
      if (line.sellingOptionId) {
        const options = (Array.isArray(product.sellingOptions) ? product.sellingOptions : []) as { id: string; name: string; unit: string; quantity: string; sellingPrice: string }[];
        const option = options.find((entry) => entry.id === line.sellingOptionId);
        if (!option) throw new BadRequestException('This selling option is no longer available. Reload the product.');
        if (!line.quantity.times(line.unitsPerOption).isInteger()) throw new BadRequestException('Enter a whole number of selling options.');
        line.unit = option.unit;
        line.optionName = option.name;
        line.unitsPerOption = new Prisma.Decimal(option.quantity);
        line.sellingPrice = new Prisma.Decimal(option.sellingPrice);
        line.lineTotal = line.quantity.times(line.sellingPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      }
      line.unit ??= product.unit;
      if (line.unit !== product.unit && !(line.unit === 'PIECE' && product.piecesPerUnit)) throw new BadRequestException('Unsupported selling unit for this product.');
      if (line.unit === 'PIECE' && !line.quantity.times(line.unitsPerOption).isInteger()) throw new BadRequestException(`${product.name} must be sold in whole pieces.`);
    }

    for (const line of lines) Object.assign(line, taxFor(line.lineTotal, productsById.get(line.productId)!.gstRate));
    const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    const taxTotal = lines.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0));
    const total = lines.reduce((sum, line) => sum.plus(line.lineTotal).plus(line.taxAmount), new Prisma.Decimal(0));
    if (total.greaterThan('999999999999.99')) throw new BadRequestException('Sale total exceeds the supported range.');
    const saleDate = new Date(input.saleDate);
    if (Number.isNaN(saleDate.getTime())) throw new BadRequestException('Invalid sale date.');

    const amountPaid = paidAmount(input.amountPaid, total);
    const dueDate = dueDateFor(input.dueDate, saleDate);
    try {
    return await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          businessId,
          customerId: input.customerId,
          invoiceNumber: input.invoiceNumber,
          saleDate,
          paymentMethod: input.paymentMethod,
          total, subtotal, taxTotal, amountPaid, dueDate, requestId: input.requestId,
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
            quantity: line.quantity.times(line.unitsPerOption),
            unit: line.unit,
            note: `Sale ${sale.id}`,
            userId,
          },
          tx,
        );
        await tx.saleItem.create({
          data: { saleId: sale.id, productId: line.productId, quantity: line.quantity, unit: line.unit, sellingOptionId: line.sellingOptionId, optionName: line.optionName, unitsPerOption: line.unitsPerOption, sellingPrice: line.sellingPrice, lineTotal: line.lineTotal, gstRate: line.gstRate, taxAmount: line.taxAmount },
        });
      }

      if (amountPaid?.gt(0)) await tx.transactionPayment.create({ data: { businessId, saleId: sale.id, requestId: `initial_${sale.id}`, amount: amountPaid, method: input.paymentMethod ?? PaymentMethod.CASH, createdByUserId: userId } });
      return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true, payments: true, customer: true } });
    });
    } catch (error) {
      if (input.requestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.sale.findUnique({ where: { businessId_requestId: { businessId, requestId: input.requestId } }, include: { items: true, payments: true, customer: true } });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async recordPayment(userId: string, businessId: string, id: string, input: RecordPaymentDto) {
    await this.requireManagerMembership(userId, businessId);
    await recordTransactionPayment(this.prisma, 'sale', businessId, userId, id, input);
    return this.get(userId, businessId, id);
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
      include: { items: true, payments: true, customer: true },
    });
  }

  private async requireSale(businessId: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, businessId },
      include: { payments: true, items: { include: { product: { select: { name: true, sku: true, unit: true } } } }, customer: true },
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
