import { taxFor, paidAmount, dueDateFor, recordTransactionPayment } from '../common/transaction-accounting.js';
import type { RecordPaymentDto } from '../common/dto/transaction-finance.dto.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, PaymentMethod, Prisma, ProductStatus, SupplierStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';

type PurchaseItemInput = {
  productId: string;
  quantity: string;
  purchasePrice: string;
};

type CreatePurchaseInput = {
  amountPaid?: string;
  dueDate?: string;
  requestId?: string;
  paymentMethod?: PaymentMethod;
  supplierId: string;
  invoiceNumber?: string;
  purchaseDate: string;
  note?: string;
  items: PurchaseItemInput[];
};

type UpdatePurchaseInput = {
  invoiceNumber?: string;
  purchaseDate?: string;
  note?: string;
};

type PriceSensitivePurchase = {
  subtotal?: unknown;
  taxTotal?: unknown;
  amountPaid?: unknown;
  payments?: unknown;
  total: unknown;
  items: Array<{ purchasePrice: unknown; lineTotal: unknown; taxAmount?: unknown }>;
};

type RedactedPurchase<T extends PriceSensitivePurchase> =
  Omit<T, 'total' | 'items' | 'subtotal' | 'taxTotal' | 'amountPaid' | 'payments'> & {
    items: Array<Omit<T['items'][number], 'purchasePrice' | 'lineTotal' | 'taxAmount'>>;
  };

function withoutPurchaseCost<T extends { purchasePrice: unknown; lineTotal: unknown; taxAmount?: unknown }>(
  item: T,
): Omit<T, 'purchasePrice' | 'lineTotal' | 'taxAmount'> {
  const { purchasePrice: _purchasePrice, lineTotal: _lineTotal, taxAmount: _taxAmount, ...visibleItem } = item;
  return visibleItem;
}

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService, private readonly inventory: InventoryService) {}

  async create(userId: string, businessId: string, input: CreatePurchaseInput) {
    await this.requireManagerMembership(userId, businessId);
    if (input.requestId) {
      const existing = await this.prisma.purchase.findUnique({ where: { businessId_requestId: { businessId, requestId: input.requestId } }, include: { items: true, payments: true, supplier: true } });
      if (existing) return existing;
    }

    const supplier = await this.prisma.supplier.findFirst({ where: { id: input.supplierId, businessId } });
    if (!supplier) throw new NotFoundException('Supplier not found.');
    if (supplier.status !== SupplierStatus.ACTIVE) throw new ConflictException('Supplier is not active.');

    if (input.items.length === 0) throw new BadRequestException('At least one purchase item is required.');

    const seen = new Set<string>();
    const lines = input.items.map((item) => {
      if (seen.has(item.productId)) throw new BadRequestException('Duplicate product in purchase items.');
      seen.add(item.productId);
      if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(item.quantity) || !/^\d{1,10}(?:\.\d{1,2})?$/.test(item.purchasePrice)) {
        throw new BadRequestException('Invalid purchase quantity or price precision.');
      }

      const quantity = new Prisma.Decimal(item.quantity);
      const purchasePrice = new Prisma.Decimal(item.purchasePrice);
      if (quantity.lessThanOrEqualTo(0)) throw new BadRequestException('Purchase item quantity must be greater than zero.');
      if (purchasePrice.lessThanOrEqualTo(0)) throw new BadRequestException('Purchase item price must be greater than zero.');

      return { productId: item.productId, quantity, purchasePrice, gstRate: new Prisma.Decimal(0), taxAmount: new Prisma.Decimal(0), lineTotal: quantity.times(purchasePrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) };
    });

    const products = await this.prisma.product.findMany({ where: { businessId, id: { in: lines.map((line) => line.productId) } } });
    const productsById = new Map(products.map((product) => [product.id, product]));
    for (const line of lines) {
      const product = productsById.get(line.productId);
      if (!product) throw new NotFoundException(`Product ${line.productId} not found in this business.`);
      if (product.status !== ProductStatus.ACTIVE) throw new ConflictException(`Product ${product.name} is not active.`);
      if (product.unit === 'PIECE' && !line.quantity.isInteger()) throw new BadRequestException(`${product.name} must be purchased in whole pieces.`);
    }

    for (const line of lines) Object.assign(line, taxFor(line.lineTotal, productsById.get(line.productId)!.gstRate));
    const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    const taxTotal = lines.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0));
    const total = lines.reduce((sum, line) => sum.plus(line.lineTotal).plus(line.taxAmount), new Prisma.Decimal(0));
    if (total.greaterThan('999999999999.99')) throw new BadRequestException('Purchase total exceeds the supported amount.');
    const purchaseDate = new Date(input.purchaseDate);
    if (Number.isNaN(purchaseDate.getTime())) throw new BadRequestException('Invalid purchase date.');

    const amountPaid = paidAmount(input.amountPaid, total);
    const dueDate = dueDateFor(input.dueDate, purchaseDate);
    try {
    return await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          businessId,
          supplierId: input.supplierId,
          invoiceNumber: input.invoiceNumber,
          purchaseDate,
          total, subtotal, taxTotal, amountPaid, dueDate, requestId: input.requestId,
          note: input.note,
          createdByUserId: userId,
        },
      });

      await tx.purchaseItem.createMany({
        data: lines.map((line) => ({
          purchaseId: purchase.id,
          productId: line.productId,
          quantity: line.quantity,
          purchasePrice: line.purchasePrice,
          lineTotal: line.lineTotal, gstRate: line.gstRate, taxAmount: line.taxAmount,
        })),
      });

      for (const line of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        await this.inventory.applyMovement(
          {
            businessId,
            productId: line.productId,
            type: InventoryTransactionType.PURCHASE,
            quantity: line.quantity,
            note: `Purchase ${purchase.id}`,
            userId,
          },
          tx,
        );
      }

      if (amountPaid?.gt(0)) await tx.transactionPayment.create({ data: { businessId, purchaseId: purchase.id, requestId: `initial_${purchase.id}`, amount: amountPaid, method: input.paymentMethod ?? PaymentMethod.CASH, createdByUserId: userId } });
      return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: { items: true, payments: true, supplier: true } });
    });
    } catch (error) {
      if (input.requestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.purchase.findUnique({ where: { businessId_requestId: { businessId, requestId: input.requestId } }, include: { items: true, payments: true, supplier: true } });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async recordPayment(userId: string, businessId: string, id: string, input: RecordPaymentDto) {
    await this.requireManagerMembership(userId, businessId);
    await recordTransactionPayment(this.prisma, 'purchase', businessId, userId, id, input);
    return this.get(userId, businessId, id);
  }

  async list(userId: string, businessId: string, query: { supplierId?: string; search?: string }) {
    const membership = await this.requireMembership(userId, businessId);
    const purchases = await this.prisma.purchase.findMany({
      where: {
        businessId,
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.search ? { invoiceNumber: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      include: { supplier: { select: { id: true, name: true } }, items: true },
      orderBy: { purchaseDate: 'desc' },
    });
    return this.applyPriceVisibility(businessId, membership, purchases);
  }

  async get(userId: string, businessId: string, purchaseId: string) {
    const membership = await this.requireMembership(userId, businessId);
    const purchase = await this.requirePurchase(businessId, purchaseId);
    return (await this.applyPriceVisibility(businessId, membership, [purchase]))[0];
  }

  /**
   * Updates purchase metadata only (invoice number, purchase date, note).
   *
   * Line items, quantities, and prices cannot be edited once a purchase has
   * been created, because inventory transactions have already been applied
   * for those items and editing them after the fact could silently corrupt
   * historical stock levels (see DEVELOPMENT_PLAN.md: "Partial purchase
   * updates cannot occur"). To correct a purchase's items, use inventory
   * adjustments (e.g. ADJUSTMENT_OUT + a new corrected purchase) rather than
   * mutating a settled purchase's inventory effects.
   */
  async update(userId: string, businessId: string, purchaseId: string, input: UpdatePurchaseInput) {
    await this.requireManagerMembership(userId, businessId);
    await this.requirePurchase(businessId, purchaseId);

    const purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : undefined;
    if (purchaseDate && Number.isNaN(purchaseDate.getTime())) throw new BadRequestException('Invalid purchase date.');

    return this.prisma.purchase.update({
      where: { id: purchaseId },
      data: { invoiceNumber: input.invoiceNumber, purchaseDate, note: input.note },
      include: { items: true, payments: true, supplier: true },
    });
  }

  private async requirePurchase(businessId: string, purchaseId: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, businessId },
      include: { payments: true, items: { include: { product: { select: { name: true, sku: true, unit: true } } } }, supplier: true },
    });
    if (!purchase) throw new NotFoundException('Purchase not found.');
    return purchase;
  }

  private async requireMembership(userId: string, businessId: string) {
    const membership = await this.prisma.businessUser.findUnique({ where: { businessId_userId: { businessId, userId } } });
    if (!membership?.isActive) throw new ForbiddenException('You do not have access to this business.');
    return membership;
  }

  private async applyPriceVisibility<T extends PriceSensitivePurchase>(
    businessId: string,
    membership: { role: string },
    purchases: T[],
  ): Promise<Array<T | RedactedPurchase<T>>> {
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') return purchases;
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { membersCanViewPurchasePrice: true },
    });
    if (business?.membersCanViewPurchasePrice !== false) return purchases;
    return purchases.map(({ total: _total, subtotal: _subtotal, taxTotal: _taxTotal, amountPaid: _paid, payments: _payments, items, ...purchase }) => ({
      ...purchase,
      items: items.map(withoutPurchaseCost),
    }));
  }

  private async requireManagerMembership(userId: string, businessId: string) {
    const membership = await this.requireMembership(userId, businessId);
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') throw new ForbiddenException('You do not have permission for this action.');
    return membership;
  }
}
