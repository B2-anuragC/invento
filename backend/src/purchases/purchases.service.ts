import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, Prisma, ProductStatus, SupplierStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';

type PurchaseItemInput = {
  productId: string;
  quantity: string;
  purchasePrice: string;
};

type CreatePurchaseInput = {
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

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService, private readonly inventory: InventoryService) {}

  async create(userId: string, businessId: string, input: CreatePurchaseInput) {
    await this.requireManagerMembership(userId, businessId);

    const supplier = await this.prisma.supplier.findFirst({ where: { id: input.supplierId, businessId } });
    if (!supplier) throw new NotFoundException('Supplier not found.');
    if (supplier.status !== SupplierStatus.ACTIVE) throw new ConflictException('Supplier is not active.');

    if (input.items.length === 0) throw new BadRequestException('At least one purchase item is required.');

    const seen = new Set<string>();
    const lines = input.items.map((item) => {
      if (seen.has(item.productId)) throw new BadRequestException('Duplicate product in purchase items.');
      seen.add(item.productId);

      const quantity = new Prisma.Decimal(item.quantity);
      const purchasePrice = new Prisma.Decimal(item.purchasePrice);
      if (quantity.lessThanOrEqualTo(0)) throw new BadRequestException('Purchase item quantity must be greater than zero.');
      if (purchasePrice.lessThanOrEqualTo(0)) throw new BadRequestException('Purchase item price must be greater than zero.');

      return { productId: item.productId, quantity, purchasePrice, lineTotal: quantity.times(purchasePrice) };
    });

    const products = await this.prisma.product.findMany({ where: { businessId, id: { in: lines.map((line) => line.productId) } } });
    const productsById = new Map(products.map((product) => [product.id, product]));
    for (const line of lines) {
      const product = productsById.get(line.productId);
      if (!product) throw new NotFoundException(`Product ${line.productId} not found in this business.`);
      if (product.status !== ProductStatus.ACTIVE) throw new ConflictException(`Product ${product.name} is not active.`);
    }

    const total = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    const purchaseDate = new Date(input.purchaseDate);
    if (Number.isNaN(purchaseDate.getTime())) throw new BadRequestException('Invalid purchase date.');

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          businessId,
          supplierId: input.supplierId,
          invoiceNumber: input.invoiceNumber,
          purchaseDate,
          total,
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
          lineTotal: line.lineTotal,
        })),
      });

      for (const line of lines) {
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

      return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: { items: true, supplier: true } });
    });
  }

  async list(userId: string, businessId: string, query: { supplierId?: string; search?: string }) {
    await this.requireMembership(userId, businessId);
    return this.prisma.purchase.findMany({
      where: {
        businessId,
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.search ? { invoiceNumber: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      include: { supplier: { select: { id: true, name: true } }, items: true },
      orderBy: { purchaseDate: 'desc' },
    });
  }

  async get(userId: string, businessId: string, purchaseId: string) {
    await this.requireMembership(userId, businessId);
    return this.requirePurchase(businessId, purchaseId);
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
      include: { items: true, supplier: true },
    });
  }

  private async requirePurchase(businessId: string, purchaseId: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, businessId },
      include: { items: true, supplier: true },
    });
    if (!purchase) throw new NotFoundException('Purchase not found.');
    return purchase;
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
