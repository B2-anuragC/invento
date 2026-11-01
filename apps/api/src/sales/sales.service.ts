import { FilesService } from '../files/files.service.js';
import { billEditBlockReason, chargeGstError, chargesGst, discountAmountFor, WALK_IN_EDIT_MESSAGE, discountError, invoiceTaxContext, lineGstRate, sellingUnitConversion, splitDiscount, WALK_IN_PAYMENT_MESSAGE } from '@invento/shared';
import { taxFor, paidAmount, dueDateFor, recordTransactionPayment } from '../common/transaction-accounting.js';
import { allocateDocumentNumber, assertNotFutureDated, assertSameFinancialYear } from '../common/document-numbers.js';
import type { CancelTransactionDto, CreateReturnDto, RecordPaymentDto } from '../common/dto/transaction-finance.dto.js';
import type { EditSaleItemsDto } from './dto/sale.dto.js';
import { cancelTransaction } from '../common/cancellation.js';
import { billReturnsInclude, recordReturn, withReturns } from '../common/returns.js';
import { applyBillEdit } from '../common/bill-edits.js';
import { requireBusinessPermission } from '../auth/business-access.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
  expectedTotal?: string;
  discountAmount?: string;
  discountPercent?: string;
  chargeGst?: boolean;
  referenceImage?: string;
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

// A sale as returned after it is written: lines with what was returned of them, and its credit notes.
const saleInclude = { items: { include: { returnItems: { select: { quantity: true } } } }, payments: true, customer: true, ...billReturnsInclude } satisfies Prisma.SaleInclude;

type PricedSaleLine = Awaited<ReturnType<SalesService['priceSale']>>['lines'][number];

/** The stock a line takes as the ledger stores it: pieces for grouped products, otherwise the product's unit. */
function lineStockQuantity(line: PricedSaleLine, piecesPerUnit: number | null) {
  const movementQuantity = line.movementQuantity ?? line.quantity.times(line.unitsPerOption);
  return (line.movementUnit ?? line.unit) === 'PIECE' && piecesPerUnit ? movementQuantity : movementQuantity.times(piecesPerUnit ?? 1);
}

/** A sale line row; it keeps the stock it took, so a return puts back its share. */
function saleItemData(saleId: string, line: PricedSaleLine, piecesPerUnit: number | null) {
  return { saleId, productId: line.productId, quantity: line.quantity, unit: line.unit, sellingOptionId: line.sellingOptionId, optionName: line.optionName, unitsPerOption: line.unitsPerOption, sellingPrice: line.sellingPrice, lineTotal: line.lineTotal, discountAmount: line.discountAmount, gstRate: line.gstRate, taxAmount: line.taxAmount, hsnCode: line.hsnCode, stockQuantity: lineStockQuantity(line, piecesPerUnit) };
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService, private readonly inventory: InventoryService, private readonly files?: FilesService) {}

  async create(userId: string, businessId: string, input: CreateSaleInput) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'sales.create');
    if (input.requestId) {
      const existing = await this.prisma.sale.findUnique({ where: { businessId_requestId: { businessId, requestId: input.requestId } }, include: saleInclude });
      if (existing) return withReturns(existing);
    }

    const referenceImage = input.referenceImage === undefined ? undefined : (await this.files!.image(businessId, input.referenceImage, 'sale')).url;
    const customer = await this.prisma.customer.findFirst({ where: { id: input.customerId, businessId } });
    if (!customer) throw new NotFoundException('Customer not found.');
    if (customer.status !== CustomerStatus.ACTIVE) throw new ConflictException('Customer is not active.');

    const invoiceDetails = await this.invoiceDetails(businessId, customer, input.chargeGst);
    const { chargeGst } = invoiceDetails;

    if (!Object.values(PaymentMethod).includes(input.paymentMethod)) throw new BadRequestException('Invalid payment method.');
    const { lines, productsById, subtotal, discountTotal, taxTotal, total } = await this.priceSale(businessId, input, chargeGst);
    const saleDate = new Date(input.saleDate);
    if (Number.isNaN(saleDate.getTime())) throw new BadRequestException('Invalid sale date.');
    assertNotFutureDated(saleDate, 'Sale');

    const amountPaid = paidAmount(input.amountPaid, total);
    // Credit needs a customer to collect from.
    if (customer.isWalkIn && !amountPaid?.equals(total)) throw new BadRequestException(WALK_IN_PAYMENT_MESSAGE);
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
          total, subtotal, discountTotal, discountPercent: input.discountPercent ? new Prisma.Decimal(input.discountPercent) : null, taxTotal, amountPaid, dueDate, requestId: input.requestId,
          note: input.note,
          referenceImage,
          ...invoiceDetails,
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
            quantity: line.movementQuantity ?? line.quantity.times(line.unitsPerOption),
            unit: line.movementUnit ?? line.unit,
            note: `Sale ${sale.id}`,
            userId,
          },
          tx,
        );
        await tx.saleItem.create({ data: saleItemData(sale.id, line, productsById.get(line.productId)!.piecesPerUnit) });
      }

      // Numbered last, after the stock locks, so the counter row is held briefly
      // and is always the final lock a sale takes (no lock-order deadlocks).
      await tx.sale.update({ where: { id: sale.id }, data: await allocateDocumentNumber(tx, businessId, 'SALE', saleDate) });

      if (amountPaid?.gt(0)) await tx.transactionPayment.create({ data: { businessId, saleId: sale.id, requestId: `initial_${sale.id}`, amount: amountPaid, method: input.paymentMethod ?? PaymentMethod.CASH, createdByUserId: userId } });
      return withReturns(await tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: saleInclude }));
    });
    } catch (error) {
      if (input.requestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.sale.findUnique({ where: { businessId_requestId: { businessId, requestId: input.requestId } }, include: saleInclude });
        if (existing) return withReturns(existing);
      }
      throw error;
    }
  }

  /**
   * GST details copied onto the sale so the issued invoice never changes when
   * the shop or customer GST profile is edited later (an item edit copies them again).
   */
  private async invoiceDetails(businessId: string, customer: { gstin: string | null }, chargeGstInput: boolean | undefined) {
    const shop = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { gstin: true, stateCode: true } });
    const tax = invoiceTaxContext({ sellerGstin: shop.gstin, sellerStateCode: shop.stateCode, buyerGstin: customer.gstin });
    const gstChoiceError = chargeGstError({ chargeGst: chargeGstInput, sellerGstin: shop.gstin });
    if (gstChoiceError) throw new BadRequestException(gstChoiceError);
    return { chargeGst: chargesGst(chargeGstInput), sellerGstin: shop.gstin, sellerStateCode: tax.sellerStateCode, buyerGstin: customer.gstin, placeOfSupply: tax.placeOfSupply, taxType: tax.taxType };
  }

  /**
   * Works out a sale's lines and totals from the items, discount and GST
   * choice: selling options and units, the discount split, each line's GST and
   * HSN code. Creating a sale and editing its items both use this, so an
   * edited bill is priced exactly like a new one.
   */
  private async priceSale(businessId: string, input: { items: SaleItemInput[]; discountAmount?: string; discountPercent?: string; expectedTotal?: string }, chargeGst: boolean, keepProductIds?: Set<string>) {
    if (input.items.length === 0) throw new BadRequestException('At least one sale item is required.');

    // A product may appear on separate lines when they are sold differently,
    // e.g. one pack plus loose pieces; an identical line must be merged instead.
    const seen = new Set<string>();
    const lines = input.items.map((item) => {
      const lineKey = `${item.productId}|${item.sellingOptionId ?? ''}|${item.unit ?? ''}`;
      if (seen.has(lineKey)) throw new BadRequestException('Duplicate sale line: combine the quantity into one line.');
      seen.add(lineKey);

      if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(item.quantity) || !/^\d{1,10}(?:\.\d{1,2})?$/.test(item.sellingPrice)) {
        throw new BadRequestException('Invalid sale quantity or selling price precision.');
      }
      const quantity = new Prisma.Decimal(item.quantity);
      const sellingPrice = new Prisma.Decimal(item.sellingPrice);
      if (quantity.lessThanOrEqualTo(0)) throw new BadRequestException('Sale item quantity must be greater than zero.');
      if (sellingPrice.lessThanOrEqualTo(0)) throw new BadRequestException('Sale item price must be greater than zero.');

      const lineTotal = quantity.times(sellingPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return { productId: item.productId, unit: item.unit, sellingOptionId: item.sellingOptionId, optionName: undefined as string | undefined, hsnCode: null as string | null, discountAmount: new Prisma.Decimal(0), unitsPerOption: new Prisma.Decimal(1), movementUnit: undefined as string | undefined, movementQuantity: undefined as Prisma.Decimal | undefined, gstRate: new Prisma.Decimal(0), taxAmount: new Prisma.Decimal(0), quantity, sellingPrice, lineTotal };
    });

    const products = await this.prisma.product.findMany({ where: { businessId, id: { in: lines.map((line) => line.productId) } } });
    const productsById = new Map(products.map((product) => [product.id, product]));
    for (const line of lines) {
      const product = productsById.get(line.productId);
      if (!product) throw new NotFoundException(`Product ${line.productId} not found in this business.`);
      // An edit may keep a product the shop has stopped selling since; it cannot add one.
      if (product.status !== ProductStatus.ACTIVE && !keepProductIds?.has(product.id)) throw new ConflictException(`Product ${product.name} is not active.`);
      line.hsnCode = product.hsnCode;
      if (line.sellingOptionId) {
        const options = (Array.isArray(product.sellingOptions) ? product.sellingOptions : []) as { id: string; name: string; unit: string; quantity: string; sellingPrice: string; piecesPerUnit?: number }[];
        const option = options.find((entry) => entry.id === line.sellingOptionId);
        if (!option) throw new BadRequestException('This selling option is no longer available. Reload the product.');
        if (!line.quantity.times(line.unitsPerOption).isInteger()) throw new BadRequestException('Enter a whole number of selling options.');
        line.unit = option.unit;
        line.optionName = option.name;
        line.unitsPerOption = new Prisma.Decimal(option.quantity);
        const conversion = sellingUnitConversion(product.unit, product.piecesPerUnit, option.unit, option.piecesPerUnit);
        if (!conversion) throw new BadRequestException('This selling option has no valid stock conversion. Edit the product option.');
        line.movementUnit = conversion.unit;
        line.movementQuantity = line.quantity.times(conversion.perOption ? 1 : line.unitsPerOption).times(conversion.numerator).div(conversion.denominator);
        line.sellingPrice = new Prisma.Decimal(option.sellingPrice);
        line.lineTotal = line.quantity.times(line.sellingPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      }
      line.unit ??= product.unit;
      if (!line.sellingOptionId && line.unit !== product.unit && !(line.unit === 'PIECE' && product.piecesPerUnit)) throw new BadRequestException('Unsupported selling unit for this product.');
      if (line.unit === 'PIECE' && !line.quantity.times(line.unitsPerOption).isInteger()) throw new BadRequestException(`${product.name} must be sold in whole pieces.`);
    }

    // A discount given at the time of sale lowers the taxable value: it is split
    // across the lines and each line's GST is charged on what is left. A sale
    // without GST charges none on any line.
    const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    const invalidDiscount = discountError(subtotal.toFixed(2), input);
    if (invalidDiscount) throw new BadRequestException(invalidDiscount);
    const discountTotal = new Prisma.Decimal(discountAmountFor(subtotal.toFixed(2), input));
    const shares = splitDiscount(lines.map((line) => line.lineTotal.toFixed(2)), discountTotal.toFixed(2));
    lines.forEach((line, index) => { line.discountAmount = new Prisma.Decimal(shares[index]); });
    for (const line of lines) Object.assign(line, taxFor(line.lineTotal.minus(line.discountAmount), lineGstRate(productsById.get(line.productId)!.gstRate?.toString(), chargeGst)));
    const taxTotal = lines.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0));
    const total = subtotal.minus(discountTotal).plus(taxTotal);
    if (input.expectedTotal !== undefined && (!/^\d{1,12}(?:\.\d{1,2})?$/.test(input.expectedTotal) || !total.equals(input.expectedTotal))) throw new ConflictException('Item rates changed the bill total. Review this pending transaction before syncing.');
    if (total.greaterThan('999999999999.99')) throw new BadRequestException('Sale total exceeds the supported range.');
    return { lines, productsById, subtotal, discountTotal, taxTotal, total };
  }

  /** Cancels a completed sale: stock comes back, money received is refunded. Owners and admins. */
  async cancel(userId: string, businessId: string, id: string, input: CancelTransactionDto) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'sales.cancel');
    await cancelTransaction(this.prisma, this.inventory, 'sale', businessId, userId, id, input);
    return this.requireSale(businessId, id);
  }

  /**
   * Edits the items, quantities, prices, discount and GST choice of a completed
   * sale, with a reason (owners and admins). The lines are priced exactly as a
   * new sale's; the number, date, customer and payment method stay. Stock
   * moves by the difference, money paid above the new total is refunded, and
   * the revision goes up (see applyBillEdit). Sales with returns or cancelled
   * ones cannot be edited.
   */
  async editItems(userId: string, businessId: string, id: string, input: EditSaleItemsDto) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'sales.edit');
    const sale = await this.prisma.sale.findFirst({ where: { id, businessId }, include: { customer: true, items: { select: { productId: true } }, _count: { select: { returns: true } } } });
    if (!sale) throw new NotFoundException('Sale not found.');
    // A retry of an edit that was saved.
    if (sale.editRequestId === input.requestId) return this.requireSale(businessId, id);
    const blocked = billEditBlockReason({ status: sale.status, returnedTotal: sale.returnedTotal.toFixed(), returnCount: sale._count.returns });
    if (blocked) throw new ConflictException(blocked);
    if (input.revision !== undefined && input.revision !== sale.revision) throw new ConflictException('This bill was changed while you were editing it. Reload it and try again.');

    const invoiceDetails = await this.invoiceDetails(businessId, sale.customer, input.chargeGst);
    const { lines, productsById, subtotal, discountTotal, taxTotal, total } = await this.priceSale(businessId, { items: input.items, discountAmount: input.discountAmount, discountPercent: input.discountPercent }, invoiceDetails.chargeGst, new Set(sale.items.map((item) => item.productId)));
    if (input.expectedTotal !== undefined && !total.equals(input.expectedTotal)) throw new ConflictException('Prices changed while you were editing. Review the new total and save again.');
    if (sale.customer.isWalkIn && (sale.amountPaid === null || total.gt(sale.amountPaid))) throw new BadRequestException(WALK_IN_EDIT_MESSAGE);

    const stock = new Map<string, Prisma.Decimal>();
    for (const line of lines) stock.set(line.productId, (stock.get(line.productId) ?? new Prisma.Decimal(0)).plus(lineStockQuantity(line, productsById.get(line.productId)!.piecesPerUnit)));
    await applyBillEdit(this.prisma, this.inventory, 'sale', businessId, userId, id, input, {
      revision: sale.revision,
      total,
      stock,
      productNames: new Map([...productsById.values()].map((product) => [product.id, product.name])),
      write: async (tx, fields) => {
        await tx.saleItem.deleteMany({ where: { saleId: id } });
        await tx.saleItem.createMany({ data: lines.map((line) => saleItemData(id, line, productsById.get(line.productId)!.piecesPerUnit)) });
        await tx.sale.update({ where: { id }, data: { subtotal, discountTotal, discountPercent: input.discountPercent ? new Prisma.Decimal(input.discountPercent) : null, taxTotal, total, ...invoiceDetails, ...fields } });
      },
    });
    return this.requireSale(businessId, id);
  }

  /** Records a sales return (credit note): stock comes back, the value reduces what is owed and the rest is refunded. Owners and admins. */
  async createReturn(userId: string, businessId: string, id: string, input: CreateReturnDto) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'sales.return');
    await recordReturn(this.prisma, this.inventory, 'sale', businessId, userId, id, input);
    return this.requireSale(businessId, id);
  }

  async recordPayment(userId: string, businessId: string, id: string, input: RecordPaymentDto) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'sales.payments');
    await recordTransactionPayment(this.prisma, 'sale', businessId, userId, id, input);
    return this.get(userId, businessId, id);
  }

  async list(userId: string, businessId: string, query: { customerId?: string; search?: string }) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'sales.view');
    const sales = await this.prisma.sale.findMany({
      where: {
        businessId,
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.search ? { OR: [{ documentNumber: { contains: query.search, mode: 'insensitive' } }, { invoiceNumber: { contains: query.search, mode: 'insensitive' } }] } : {}),
      },
      select: { id: true, businessId: true, customerId: true, invoiceNumber: true, documentNumber: true, financialYear: true, documentSeq: true, sellerGstin: true, sellerStateCode: true, buyerGstin: true, placeOfSupply: true, taxType: true, chargeGst: true, saleDate: true, paymentMethod: true, subtotal: true, discountTotal: true, discountPercent: true, taxTotal: true, amountPaid: true, dueDate: true, requestId: true, total: true, returnedTotal: true, status: true, cancelledAt: true, cancelReason: true, revision: true, editedAt: true, editedByUserId: true, editReason: true, note: true, createdByUserId: true, createdAt: true, updatedAt: true, customer: { select: { id: true, name: true } }, items: { include: { returnItems: { select: { quantity: true } } } }, payments: { select: { method: true, kind: true }, orderBy: { paidAt: 'asc' } }, ...billReturnsInclude },
      orderBy: { saleDate: 'desc' },
    });
    return sales.map(withReturns);
  }

  async get(userId: string, businessId: string, saleId: string) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'sales.view');
    return this.requireSale(businessId, saleId);
  }

  /**
   * Updates sale metadata only (reference, sale date, note). The system
   * invoice number cannot change, and the date must stay in its financial year.
   * Items, prices, discount and GST are changed with editItems, which moves
   * stock and settles money in the same transaction.
   */
  async update(userId: string, businessId: string, saleId: string, input: UpdateSaleInput) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'sales.update');
    const existing = await this.requireSale(businessId, saleId);
    if (existing.status === 'CANCELLED') throw new ConflictException('A cancelled sale cannot be edited.');

    const saleDate = input.saleDate ? new Date(input.saleDate) : undefined;
    if (saleDate && Number.isNaN(saleDate.getTime())) throw new BadRequestException('Invalid sale date.');
    if (saleDate) {
      assertNotFutureDated(saleDate, 'Sale');
      assertSameFinancialYear(existing, saleDate);
    }

    return withReturns(await this.prisma.sale.update({
      where: { id: saleId },
      data: { invoiceNumber: input.invoiceNumber, saleDate, note: input.note },
      include: saleInclude,
    }));
  }

  private async requireSale(businessId: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, businessId },
      include: { payments: true, items: { include: { product: { select: { name: true, sku: true, unit: true } }, returnItems: { select: { quantity: true } } } }, customer: true, ...billReturnsInclude },
    });
    if (!sale) throw new NotFoundException('Sale not found.');
    return withReturns(sale);
  }


}
