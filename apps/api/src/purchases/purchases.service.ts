import { FilesService, type StoredAttachment } from '../files/files.service.js';
import {
  taxFor,
  paidAmount,
  dueDateFor,
  recordTransactionPayment,
} from '../common/transaction-accounting.js';
import type { CancelTransactionDto, CreateReturnDto, RecordPaymentDto } from '../common/dto/transaction-finance.dto.js';
import { cancelTransaction } from '../common/cancellation.js';
import { billReturnsInclude, recordReturn, withReturns } from '../common/returns.js';
import { allocateDocumentNumber, assertNotFutureDated, assertSameFinancialYear } from '../common/document-numbers.js';
import { requireBusinessPermission } from '../auth/business-access.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryTransactionType,
  PaymentMethod,
  Prisma,
  ProductStatus,
  SupplierStatus,
} from '@prisma/client';
import { chargesGst, lineGstRate } from '@invento/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';

type PurchaseItemInput = {
  productId: string;
  quantity: string;
  purchasePrice: string;
};

type CreatePurchaseInput = {
  expectedTotal?: string;
  attachment?: {
    name: string;
    mimeType: string;
    base64?: string;
    url?: string;
    thumbnailUrl?: string;
  };
  amountPaid?: string;
  dueDate?: string;
  requestId?: string;
  paymentMethod?: PaymentMethod;
  supplierId: string;
  invoiceNumber?: string;
  purchaseDate: string;
  note?: string;
  chargeGst?: boolean;
  items: PurchaseItemInput[];
};

type UpdatePurchaseInput = {
  invoiceNumber?: string;
  purchaseDate?: string;
  note?: string;
};

type PriceSensitivePurchase = {
  attachment?: unknown;
  subtotal?: unknown;
  taxTotal?: unknown;
  amountPaid?: unknown;
  payments?: unknown;
  returnedTotal?: unknown;
  netTotal?: unknown;
  returns?: Array<Record<string, unknown> & { items: Array<Record<string, unknown>> }>;
  total: unknown;
  items: Array<{
    purchasePrice: unknown;
    lineTotal: unknown;
    taxAmount?: unknown;
  }>;
};

type RedactedPurchase<T extends PriceSensitivePurchase> = Omit<
  T,
  | 'total'
  | 'items'
  | 'subtotal'
  | 'taxTotal'
  | 'amountPaid'
  | 'payments'
  | 'attachment'
  | 'returnedTotal'
  | 'netTotal'
  | 'returns'
> & {
  total?: never;
  returns?: Array<Record<string, unknown>>;
  items: Array<
    Omit<T['items'][number], 'purchasePrice' | 'lineTotal' | 'taxAmount'>
  >;
};

function withoutPurchaseCost<
  T extends { purchasePrice: unknown; lineTotal: unknown; taxAmount?: unknown },
>(item: T): Omit<T, 'purchasePrice' | 'lineTotal' | 'taxAmount'> {
  const {
    purchasePrice: _purchasePrice,
    lineTotal: _lineTotal,
    taxAmount: _taxAmount,
    ...visibleItem
  } = item;
  return visibleItem;
}

// A purchase as returned after it is written: lines with what was returned of them, and its debit notes.
const purchaseInclude = { items: { include: { returnItems: { select: { quantity: true } } } }, payments: true, supplier: true, ...billReturnsInclude } satisfies Prisma.PurchaseInclude;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly files?: FilesService,
  ) {}

  async create(userId: string, businessId: string, input: CreatePurchaseInput) {
    const membership = await requireBusinessPermission(
      this.prisma,
      userId,
      businessId,
      'purchases.create',
    );
    if (input.requestId) {
      const existing = await this.prisma.purchase.findUnique({
        where: {
          businessId_requestId: { businessId, requestId: input.requestId },
        },
        include: purchaseInclude,
      });
      if (existing)
        return (
          await this.applyPriceVisibility(businessId, membership, [withReturns(existing)])
        )[0];
    }

    let attachment: StoredAttachment | undefined;
    if (input.attachment) {
      const file = input.attachment;
      if (file.base64)
        attachment = await this.files!.store(
          businessId,
          { name: file.name, mimeType: file.mimeType, base64: file.base64 },
          'purchase',
        );
      else if (file.url)
        attachment = await this.files!.reference(
          businessId,
          file.url,
          'purchase',
        );
      else
        throw new BadRequestException(
          'Upload the purchase attachment before saving.',
        );
    }
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: input.supplierId, businessId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found.');
    if (supplier.status !== SupplierStatus.ACTIVE)
      throw new ConflictException('Supplier is not active.');

    if (input.items.length === 0)
      throw new BadRequestException('At least one purchase item is required.');

    const seen = new Set<string>();
    const lines = input.items.map((item) => {
      if (seen.has(item.productId))
        throw new BadRequestException('Duplicate product in purchase items.');
      seen.add(item.productId);
      if (
        !/^\d{1,9}(?:\.\d{1,3})?$/.test(item.quantity) ||
        !/^\d{1,10}(?:\.\d{1,2})?$/.test(item.purchasePrice)
      ) {
        throw new BadRequestException(
          'Invalid purchase quantity or price precision.',
        );
      }

      const quantity = new Prisma.Decimal(item.quantity);
      const purchasePrice = new Prisma.Decimal(item.purchasePrice);
      if (quantity.lessThanOrEqualTo(0))
        throw new BadRequestException(
          'Purchase item quantity must be greater than zero.',
        );
      if (purchasePrice.lessThanOrEqualTo(0))
        throw new BadRequestException(
          'Purchase item price must be greater than zero.',
        );

      return {
        productId: item.productId,
        quantity,
        purchasePrice,
        gstRate: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        lineTotal: quantity
          .times(purchasePrice)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      };
    });

    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: lines.map((line) => line.productId) } },
    });
    if (supplier.categories?.length || supplier.productIds?.length) {
      for (const product of products)
        if (
          !supplier.productIds?.includes(product.id) &&
          !(product.category && supplier.categories?.includes(product.category))
        )
          throw new BadRequestException(
            'This product is not assigned to the selected supplier. Update their product list in People.',
          );
    }
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    for (const line of lines) {
      const product = productsById.get(line.productId);
      if (!product)
        throw new NotFoundException(
          `Product ${line.productId} not found in this business.`,
        );
      if (product.status !== ProductStatus.ACTIVE)
        throw new ConflictException(`Product ${product.name} is not active.`);
      if (product.unit === 'PIECE' && !line.quantity.isInteger())
        throw new BadRequestException(
          `${product.name} must be purchased in whole pieces.`,
        );
    }

    // Without GST from the supplier, no line carries tax.
    const chargeGst = chargesGst(input.chargeGst);
    for (const line of lines)
      Object.assign(
        line,
        taxFor(
          line.lineTotal,
          lineGstRate(productsById.get(line.productId)!.gstRate?.toString(), chargeGst),
        ),
      );
    const subtotal = lines.reduce(
      (sum, line) => sum.plus(line.lineTotal),
      new Prisma.Decimal(0),
    );
    const taxTotal = lines.reduce(
      (sum, line) => sum.plus(line.taxAmount),
      new Prisma.Decimal(0),
    );
    const total = lines.reduce(
      (sum, line) => sum.plus(line.lineTotal).plus(line.taxAmount),
      new Prisma.Decimal(0),
    );
    if (
      input.expectedTotal !== undefined &&
      (!/^\d{1,12}(?:\.\d{1,2})?$/.test(input.expectedTotal) ||
        !total.equals(input.expectedTotal))
    )
      throw new ConflictException(
        'Item rates changed the bill total. Review this pending transaction before syncing.',
      );
    if (total.greaterThan('999999999999.99'))
      throw new BadRequestException(
        'Purchase total exceeds the supported amount.',
      );
    const purchaseDate = new Date(input.purchaseDate);
    if (Number.isNaN(purchaseDate.getTime()))
      throw new BadRequestException('Invalid purchase date.');
    assertNotFutureDated(purchaseDate, 'Purchase');

    const amountPaid = paidAmount(input.amountPaid, total);
    const dueDate = dueDateFor(input.dueDate, purchaseDate);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const purchase = await tx.purchase.create({
          data: {
            businessId,
            supplierId: input.supplierId,
            invoiceNumber: input.invoiceNumber,
            purchaseDate,
            total,
            subtotal,
            taxTotal,
            chargeGst,
            amountPaid,
            dueDate,
            requestId: input.requestId,
            note: input.note,
            attachment: attachment ? { ...attachment } : undefined,
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
            gstRate: line.gstRate,
            taxAmount: line.taxAmount,
          })),
        });

        for (const line of [...lines].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        )) {
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

        // Numbered last, after the stock locks (see SalesService.create).
        await tx.purchase.update({
          where: { id: purchase.id },
          data: await allocateDocumentNumber(tx, businessId, 'PURCHASE', purchaseDate),
        });

        if (amountPaid?.gt(0))
          await tx.transactionPayment.create({
            data: {
              businessId,
              purchaseId: purchase.id,
              requestId: `initial_${purchase.id}`,
              amount: amountPaid,
              method: input.paymentMethod ?? PaymentMethod.CASH,
              createdByUserId: userId,
            },
          });
        return tx.purchase.findUniqueOrThrow({
          where: { id: purchase.id },
          include: purchaseInclude,
        });
      });
      return (
        await this.applyPriceVisibility(businessId, membership, [withReturns(created)])
      )[0];
    } catch (error) {
      if (
        input.requestId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.purchase.findUnique({
          where: {
            businessId_requestId: { businessId, requestId: input.requestId },
          },
          include: purchaseInclude,
        });
        if (existing)
          return (
            await this.applyPriceVisibility(businessId, membership, [withReturns(existing)])
          )[0];
      }
      throw error;
    }
  }

  /** Cancels a completed purchase: its stock goes out again (refused if already sold), money paid is refunded. */
  async cancel(userId: string, businessId: string, id: string, input: CancelTransactionDto) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'purchases.cancel');
    await cancelTransaction(this.prisma, this.inventory, 'purchase', businessId, userId, id, input);
    return this.get(userId, businessId, id);
  }

  /** Records a purchase return (debit note): the stock goes back to the supplier (refused if it is no longer here); the value reduces what the shop owes and the rest is refunded. Owners and admins. */
  async createReturn(userId: string, businessId: string, id: string, input: CreateReturnDto) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'purchases.return');
    await recordReturn(this.prisma, this.inventory, 'purchase', businessId, userId, id, input);
    return this.get(userId, businessId, id);
  }

  async recordPayment(
    userId: string,
    businessId: string,
    id: string,
    input: RecordPaymentDto,
  ) {
    await requireBusinessPermission(
      this.prisma,
      userId,
      businessId,
      'purchases.payments',
    );
    await requireBusinessPermission(
      this.prisma,
      userId,
      businessId,
      'pricing.view',
    );
    await recordTransactionPayment(
      this.prisma,
      'purchase',
      businessId,
      userId,
      id,
      input,
    );
    return this.get(userId, businessId, id);
  }

  async list(
    userId: string,
    businessId: string,
    query: { supplierId?: string; search?: string },
  ) {
    const membership = await requireBusinessPermission(
      this.prisma,
      userId,
      businessId,
      'purchases.view',
    );
    const purchases = await this.prisma.purchase.findMany({
      where: {
        businessId,
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.search
          ? {
              OR: [
                { documentNumber: { contains: query.search, mode: 'insensitive' } },
                { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        businessId: true,
        supplierId: true,
        invoiceNumber: true,
        documentNumber: true,
        financialYear: true,
        documentSeq: true,
        purchaseDate: true,
        subtotal: true,
        taxTotal: true,
        chargeGst: true,
        amountPaid: true,
        dueDate: true,
        requestId: true,
        total: true,
        returnedTotal: true,
        status: true,
        cancelledAt: true,
        cancelReason: true,
        note: true,
        createdByUserId: true,
        createdAt: true,
        updatedAt: true,
        supplier: { select: { id: true, name: true } },
        items: { include: { returnItems: { select: { quantity: true } } } },
        // Credit and debit note numbers show in the lists.
        ...billReturnsInclude,
      },
      orderBy: { purchaseDate: 'desc' },
    });
    return this.applyPriceVisibility(businessId, membership, purchases.map(withReturns));
  }

  async get(userId: string, businessId: string, purchaseId: string) {
    const membership = await requireBusinessPermission(
      this.prisma,
      userId,
      businessId,
      'purchases.view',
    );
    const purchase = await this.requirePurchase(businessId, purchaseId);
    return (
      await this.applyPriceVisibility(businessId, membership, [purchase])
    )[0];
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
  async update(
    userId: string,
    businessId: string,
    purchaseId: string,
    input: UpdatePurchaseInput,
  ) {
    const membership = await requireBusinessPermission(
      this.prisma,
      userId,
      businessId,
      'purchases.update',
    );
    const existing = await this.requirePurchase(businessId, purchaseId);
    if (existing.status === 'CANCELLED') throw new ConflictException('A cancelled purchase cannot be edited.');

    const purchaseDate = input.purchaseDate
      ? new Date(input.purchaseDate)
      : undefined;
    if (purchaseDate && Number.isNaN(purchaseDate.getTime()))
      throw new BadRequestException('Invalid purchase date.');
    if (purchaseDate) {
      assertNotFutureDated(purchaseDate, 'Purchase');
      assertSameFinancialYear(existing, purchaseDate);
    }

    const updated = await this.prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        invoiceNumber: input.invoiceNumber,
        purchaseDate,
        note: input.note,
      },
      include: purchaseInclude,
    });
    return (
      await this.applyPriceVisibility(businessId, membership, [withReturns(updated)])
    )[0];
  }

  private async requirePurchase(businessId: string, purchaseId: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, businessId },
      include: {
        payments: true,
        items: {
          include: {
            product: { select: { name: true, sku: true, unit: true } },
            returnItems: { select: { quantity: true } },
          },
        },
        supplier: true,
        ...billReturnsInclude,
      },
    });
    if (!purchase) throw new NotFoundException('Purchase not found.');
    return withReturns(purchase);
  }

  async applyPriceVisibility<T extends PriceSensitivePurchase>(
    businessId: string,
    membership: { role: string; permissions?: readonly string[] },
    purchases: T[],
  ): Promise<Array<T | RedactedPurchase<T>>> {
    if (membership.permissions?.includes('pricing.view')) return purchases;
    return purchases.map(
      ({
        total: _total,
        subtotal: _subtotal,
        taxTotal: _taxTotal,
        amountPaid: _paid,
        payments: _payments,
        attachment: _attachment,
        returnedTotal: _returnedTotal,
        netTotal: _netTotal,
        returns,
        items,
        ...purchase
      }) => ({
        ...purchase,
        items: items.map(withoutPurchaseCost),
        // Debit notes show what went back, not what it cost.
        ...(returns ? { returns: returns.map(({ subtotal: _s, taxTotal: _t, total: _total, refundAmount: _r, refundMethod: _m, items: lines, ...note }) => ({ ...note, items: lines.map(({ lineTotal: _l, taxAmount: _x, ...line }) => line) })) } : {}),
      }),
    );
  }
}
