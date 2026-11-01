import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, PaymentMethod, Prisma } from '@prisma/client';
import { NOTHING_RETURNED, returnLineAmounts, returnQuantityError, returnSettlement, sumAmounts, sumQuantities, type ReturnedSoFar } from '@invento/shared';
import type { InventoryService } from '../inventory/inventory.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { allocateDocumentNumber } from './document-numbers.js';
import type { CreateReturnDto } from './dto/transaction-finance.dto.js';

export type ReturnKind = 'sale' | 'purchase';

/** A bill line with what earlier returns took from it. Stock is in ledger units (pieces for grouped products). */
export type ReturnableBillLine = {
  id: string;
  productId: string;
  productName: string;
  productUnit: string;
  piecesPerUnit: number | null;
  quantity: string;
  lineTotal: string;
  discountAmount?: string;
  taxAmount: string;
  gstRate: string;
  /** Stock the line moved; null when it is not known (an older line sold with a selling option). */
  stockQuantity: string | null;
  returned: ReturnedSoFar;
};

export type PlannedReturnLine = { line: ReturnableBillLine; quantity: string; stockQuantity: string; lineTotal: string; discountAmount: string; taxAmount: string };

const thousandths = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0').slice(0, 3));
};
const fromThousandths = (value: bigint) => `${value / 1000n}.${String(value % 1000n).padStart(3, '0')}`;

/**
 * Works out a return: for each requested line the quantity is checked against
 * what is left, the amounts are reversed in proportion (shared helper), and
 * the stock to put back is the same share of the stock the line moved. That
 * share must be exact: whole pieces for products counted in pieces.
 */
export function planReturn(lines: ReturnableBillLine[], requested: { itemId: string; quantity: string }[]) {
  if (requested.length === 0) throw new BadRequestException('Choose at least one item to return.');
  const byId = new Map(lines.map((line) => [line.id, line]));
  const seen = new Set<string>();
  const planned: PlannedReturnLine[] = requested.map(({ itemId, quantity }) => {
    const line = byId.get(itemId);
    if (!line) throw new BadRequestException('A returned item is not on this bill.');
    if (seen.has(itemId)) throw new BadRequestException('Each item can appear only once in a return.');
    seen.add(itemId);
    const invalid = returnQuantityError(line.quantity, line.returned.quantity, quantity);
    if (invalid) throw new BadRequestException(`${line.productName}: ${invalid}`);
    if (line.stockQuantity === null) throw new ConflictException(`${line.productName} on this older bill cannot be returned here. Adjust its stock in Inventory instead.`);

    // The running share of the line's stock for everything returned so far, less what earlier returns put back.
    const sold = thousandths(line.quantity);
    const stock = thousandths(line.stockQuantity);
    const running = (returned: bigint) => (returned === sold ? stock : (stock * returned) / sold);
    const exact = (returned: bigint) => returned === sold || (stock * returned) % sold === 0n;
    const before = thousandths(line.returned.quantity);
    const after = before + thousandths(quantity);
    const wholePieces = line.piecesPerUnit != null || line.productUnit === 'PIECE';
    if (!exact(after) || !exact(before) || (wholePieces && running(after) % 1000n !== 0n)) {
      throw new BadRequestException(wholePieces ? `${line.productName} must be returned in whole pieces.` : `${line.productName}: this quantity cannot be returned exactly. Return whole selling units.`);
    }
    const stockQuantity = running(after) - running(before);
    if (stockQuantity <= 0n) throw new BadRequestException(`${line.productName}: this quantity is too small to return.`);
    return { line, quantity, stockQuantity: fromThousandths(stockQuantity), ...returnLineAmounts(line, line.returned, quantity) };
  });
  const subtotal = sumAmounts(planned.map((entry) => entry.lineTotal));
  const discountTotal = sumAmounts(planned.map((entry) => entry.discountAmount));
  const taxTotal = sumAmounts(planned.map((entry) => entry.taxAmount));
  const total = sumAmounts([subtotal, `-${discountTotal}`, taxTotal]);
  return { lines: planned, subtotal, discountTotal, taxTotal, total };
}

/** What earlier return lines took back from one bill line. */
export function returnedSoFar(items: { quantity: Prisma.Decimal; lineTotal: Prisma.Decimal; discountAmount?: Prisma.Decimal; taxAmount: Prisma.Decimal }[]): ReturnedSoFar {
  if (items.length === 0) return NOTHING_RETURNED;
  return {
    quantity: sumQuantities(items.map((item) => item.quantity.toFixed())),
    lineTotal: sumAmounts(items.map((item) => item.lineTotal.toFixed())),
    discountAmount: sumAmounts(items.map((item) => item.discountAmount?.toFixed() ?? '0')),
    taxAmount: sumAmounts(items.map((item) => item.taxAmount.toFixed())),
  };
}

/**
 * Adds the net amount and each line's returned quantity to a bill read with
 * its lines' return items. The bill itself never changes when goods are returned.
 */
export function withReturns<T extends { total: Prisma.Decimal; returnedTotal: Prisma.Decimal; items: Array<object & { returnItems?: { quantity: Prisma.Decimal }[] }> }>(
  bill: T,
): Omit<T, 'items'> & { netTotal: Prisma.Decimal; items: Array<Omit<T['items'][number], 'returnItems'> & { returnedQuantity: Prisma.Decimal }> } {
  return {
    ...bill,
    netTotal: bill.total.minus(bill.returnedTotal),
    items: bill.items.map(({ returnItems = [], ...item }) => ({ ...item, returnedQuantity: returnItems.reduce((sum, entry) => sum.plus(entry.quantity), new Prisma.Decimal(0)) })) as Array<Omit<T['items'][number], 'returnItems'> & { returnedQuantity: Prisma.Decimal }>,
  };
}

/** Prisma include for a bill with its returns, so withReturns can add the returned quantities. */
export const billReturnsInclude = { returns: { include: { items: true }, orderBy: { returnDate: 'asc' as const } } };

/**
 * Records a sales return (credit note) or purchase return (debit note) in one
 * transaction: the bill row is locked, the lines are checked against what is
 * left, the note is numbered in its own series, stock comes back (RETURN_IN)
 * or goes out (RETURN_OUT, refused when it is no longer there), and the value
 * first reduces what is still owed on the bill and the rest is refunded.
 * A retried request (same requestId) returns without changing anything.
 * Lock order: bill row, then the note's counter, then stock rows; sales take
 * stock rows before their own (different) counter, so no cycle can form.
 */
export async function recordReturn(prisma: PrismaService, inventory: InventoryService, kind: ReturnKind, businessId: string, userId: string, billId: string, input: CreateReturnDto): Promise<void> {
  const reason = input.reason?.trim() || null;
  const notFound = kind === 'sale' ? 'Sale not found.' : 'Purchase not found.';
  const existing = async (client: Prisma.TransactionClient | PrismaService) => {
    const where = { businessId_requestId: { businessId, requestId: input.requestId } };
    const found = kind === 'sale' ? await client.saleReturn.findUnique({ where, select: { saleId: true } }).then((row) => row && row.saleId) : await client.purchaseReturn.findUnique({ where, select: { purchaseId: true } }).then((row) => row && row.purchaseId);
    if (found && found !== billId) throw new ConflictException('This return request has already been used.');
    return !!found;
  };
  try {
    await prisma.$transaction(async (tx) => {
      const [bill] = await tx.$queryRaw<{ status: string; total: Prisma.Decimal; amountPaid: Prisma.Decimal | null; returnedTotal: Prisma.Decimal }[]>(
        Prisma.sql`SELECT status, total, "amountPaid", "returnedTotal" FROM ${Prisma.raw(kind === 'sale' ? 'sales' : 'purchases')} WHERE id = ${billId} AND "businessId" = ${businessId} FOR UPDATE`,
      );
      if (!bill) throw new NotFoundException(notFound);
      if (await existing(tx)) return;
      if (bill.status === 'CANCELLED') throw new ConflictException('A cancelled bill cannot be returned.');
      if (bill.status !== 'COMPLETED') throw new ConflictException('Only a completed bill can be returned.');

      const product = { select: { name: true, unit: true, piecesPerUnit: true } };
      const lines: ReturnableBillLine[] = kind === 'sale'
        ? (await tx.saleItem.findMany({ where: { saleId: billId }, include: { product, returnItems: true } })).map((item) => ({
            id: item.id, productId: item.productId, productName: item.product.name, productUnit: item.product.unit, piecesPerUnit: item.product.piecesPerUnit,
            quantity: item.quantity.toFixed(), lineTotal: item.lineTotal.toFixed(), discountAmount: item.discountAmount.toFixed(), taxAmount: item.taxAmount.toFixed(), gstRate: item.gstRate.toFixed(),
            stockQuantity: item.stockQuantity?.toFixed() ?? null, returned: returnedSoFar(item.returnItems),
          }))
        : (await tx.purchaseItem.findMany({ where: { purchaseId: billId }, include: { product, returnItems: true } })).map((item) => ({
            id: item.id, productId: item.productId, productName: item.product.name, productUnit: item.product.unit, piecesPerUnit: item.product.piecesPerUnit,
            quantity: item.quantity.toFixed(), lineTotal: item.lineTotal.toFixed(), taxAmount: item.taxAmount.toFixed(), gstRate: item.gstRate.toFixed(),
            // A purchase line is bought in the product's unit; the ledger keeps grouped products in pieces.
            stockQuantity: item.quantity.times(item.product.piecesPerUnit ?? 1).toFixed(), returned: returnedSoFar(item.returnItems),
          }));
      const plan = planReturn(lines, input.items);

      const settlement = returnSettlement({ netTotal: bill.total.minus(bill.returnedTotal).toFixed(), amountPaid: bill.amountPaid?.toFixed() ?? null, returnTotal: plan.total });
      const refund = new Prisma.Decimal(settlement.refund);
      const link = kind === 'sale' ? { saleId: billId } : { purchaseId: billId };
      let refundMethod: PaymentMethod | null = null;
      if (refund.gt(0)) {
        const last = await tx.transactionPayment.findFirst({ where: { ...link, kind: 'PAYMENT' }, orderBy: { paidAt: 'desc' }, select: { method: true } });
        refundMethod = input.refundMethod ?? last?.method ?? PaymentMethod.CASH;
      }

      const returnDate = new Date();
      const number = await allocateDocumentNumber(tx, businessId, kind === 'sale' ? 'CREDIT_NOTE' : 'DEBIT_NOTE', returnDate);
      const header = { businessId, ...number, returnDate, subtotal: plan.subtotal, taxTotal: plan.taxTotal, total: plan.total, refundAmount: refund, refundMethod, reason, requestId: input.requestId, createdByUserId: userId };
      const created = kind === 'sale'
        ? await tx.saleReturn.create({ data: { ...header, saleId: billId, discountTotal: plan.discountTotal, items: { create: plan.lines.map((entry) => ({ saleItemId: entry.line.id, productId: entry.line.productId, quantity: entry.quantity, stockQuantity: entry.stockQuantity, lineTotal: entry.lineTotal, discountAmount: entry.discountAmount, gstRate: entry.line.gstRate, taxAmount: entry.taxAmount })) } } })
        : await tx.purchaseReturn.create({ data: { ...header, purchaseId: billId, items: { create: plan.lines.map((entry) => ({ purchaseItemId: entry.line.id, productId: entry.line.productId, quantity: entry.quantity, lineTotal: entry.lineTotal, gstRate: entry.line.gstRate, taxAmount: entry.taxAmount })) } } });

      // Stable product order, as sales and purchases lock stock rows.
      for (const entry of [...plan.lines].sort((a, b) => a.line.productId.localeCompare(b.line.productId))) {
        try {
          await inventory.applyMovement(
            {
              businessId,
              productId: entry.line.productId,
              type: kind === 'sale' ? InventoryTransactionType.RETURN_IN : InventoryTransactionType.RETURN_OUT,
              quantity: entry.stockQuantity,
              unit: entry.line.piecesPerUnit ? 'PIECE' : undefined,
              note: `${kind === 'sale' ? 'Credit note' : 'Debit note'} ${number.documentNumber}`,
              userId,
            },
            tx,
          );
        } catch (error) {
          if (kind === 'purchase' && error instanceof BadRequestException && /Insufficient stock/.test(error.message)) {
            throw new ConflictException(`Not enough ${entry.line.productName} in stock to return: it has already been sold or used.`);
          }
          throw error;
        }
      }

      if (refund.gt(0)) await tx.transactionPayment.create({ data: { ...link, businessId, requestId: `return_${created.id}`, amount: refund, method: refundMethod!, kind: 'REFUND', createdByUserId: userId } });
      const totals = { returnedTotal: bill.returnedTotal.plus(plan.total), ...(bill.amountPaid !== null && refund.gt(0) ? { amountPaid: bill.amountPaid.minus(refund) } : {}) };
      if (kind === 'sale') await tx.sale.update({ where: { id: billId }, data: totals });
      else await tx.purchase.update({ where: { id: billId }, data: totals });
    });
  } catch (error) {
    // Two copies of one request raced: the loser finds the winner's return.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && (await existing(prisma))) return;
    throw error;
  }
}
