import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, PaymentMethod, Prisma } from '@prisma/client';
import { billEditBlockReason, billEditSettlement } from '@invento/shared';
import type { InventoryService } from '../inventory/inventory.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

export type BillKind = 'sale' | 'purchase';

const zero = new Prisma.Decimal(0);

/** Ledger notes of a bill's own stock movements: those it made, and the corrections of its item edits. */
export const billStockNotes = (kind: BillKind, id: string) => (kind === 'sale' ? [`Sale ${id}`, `Edited sale ${id}`] : [`Purchase ${id}`, `Edited purchase ${id}`]);

/**
 * The stock a bill holds per product, in ledger units (pieces for grouped
 * products): what a sale took or a purchase added, from the signed ledger
 * rows of the bill and its edits. Products it no longer moves are left out.
 */
export function billStockEffect(kind: BillKind, rows: { productId: string; quantity: Prisma.Decimal }[]): Map<string, Prisma.Decimal> {
  const effect = new Map<string, Prisma.Decimal>();
  for (const row of rows) effect.set(row.productId, (effect.get(row.productId) ?? zero).plus(kind === 'sale' ? row.quantity.negated() : row.quantity));
  for (const [productId, quantity] of effect) if (quantity.isZero()) effect.delete(productId);
  return effect;
}

export type StockEditMovement = { productId: string; direction: 'more' | 'less'; quantity: Prisma.Decimal };

/**
 * The stock movements that take a bill from the stock it holds now to the
 * stock its edited lines need, one per product that changes, in product order
 * (the order stock rows are locked in). Only the difference moves, so lowering
 * a purchase whose stock was partly sold is refused only when it is really short.
 */
export function stockEditMovements(current: Map<string, Prisma.Decimal>, next: Map<string, Prisma.Decimal>): StockEditMovement[] {
  const products = [...new Set([...current.keys(), ...next.keys()])].sort((a, b) => a.localeCompare(b));
  return products.flatMap((productId) => {
    const delta = (next.get(productId) ?? zero).minus(current.get(productId) ?? zero);
    if (delta.isZero()) return [];
    return [{ productId, direction: delta.gt(0) ? ('more' as const) : ('less' as const), quantity: delta.abs() }];
  });
}

/** Reads the stock a bill holds per product from the ledger, inside the caller's transaction. */
export async function readBillStockEffect(tx: Prisma.TransactionClient, kind: BillKind, businessId: string, id: string) {
  const rows = await tx.inventoryTransaction.findMany({ where: { businessId, note: { in: billStockNotes(kind, id) } }, select: { productId: true, quantity: true } });
  return billStockEffect(kind, rows);
}

export type BillEditInput = { requestId: string; reason: string; refundMethod?: PaymentMethod };

export type BillEditPlan = {
  /** The bill's revision when it was priced; the edit is refused if it changed since. */
  revision: number;
  total: Prisma.Decimal;
  /** Stock each product needs after the edit (taken by a sale, added by a purchase), in ledger units. */
  stock: Map<string, Prisma.Decimal>;
  productNames: Map<string, string>;
  /** Replaces the bill's lines and updates its totals together with the edit fields given. */
  write: (tx: Prisma.TransactionClient, fields: { revision: number; editedAt: Date; editedByUserId: string; editReason: string; editRequestId: string; amountPaid?: Prisma.Decimal }) => Promise<void>;
};

/**
 * Edits the items of a completed sale or purchase in one transaction. The bill
 * row is locked (as payments, returns and cancelling do), so nothing can
 * change it in between; the bill must still be at the revision it was priced
 * at. Stock moves by the difference between what the bill holds and what its
 * new lines need (refused when it is short), the lines and totals are
 * replaced, money paid above the new total is refunded, and the revision goes
 * up with who edited it, when and why. The same requestId edits only once:
 * a retry returns without changing anything. Lock order: bill row, then stock
 * rows in product order, as cancelling does.
 */
export async function applyBillEdit(prisma: PrismaService, inventory: InventoryService, kind: BillKind, businessId: string, userId: string, id: string, input: BillEditInput, plan: BillEditPlan): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new BadRequestException('Enter why this bill is edited.');
  const table = kind === 'sale' ? 'sales' : 'purchases';
  await prisma.$transaction(async (tx) => {
    const [bill] = await tx.$queryRaw<{ status: string; revision: number; amountPaid: Prisma.Decimal | null; returnedTotal: Prisma.Decimal; editRequestId: string | null }[]>(
      Prisma.sql`SELECT status, revision, "amountPaid", "returnedTotal", "editRequestId" FROM ${Prisma.raw(table)} WHERE id = ${id} AND "businessId" = ${businessId} FOR UPDATE`,
    );
    if (!bill) throw new NotFoundException(kind === 'sale' ? 'Sale not found.' : 'Purchase not found.');
    if (bill.editRequestId === input.requestId) return;
    const returnCount = kind === 'sale' ? await tx.saleReturn.count({ where: { saleId: id } }) : await tx.purchaseReturn.count({ where: { purchaseId: id } });
    const blocked = billEditBlockReason({ status: bill.status, returnedTotal: bill.returnedTotal.toFixed(), returnCount });
    if (blocked) throw new ConflictException(blocked);
    if (bill.revision !== plan.revision) throw new ConflictException('This bill was changed while you were editing it. Reload it and try again.');

    const current = await readBillStockEffect(tx, kind, businessId, id);
    for (const movement of stockEditMovements(current, plan.stock)) {
      const product = await tx.product.findUniqueOrThrow({ where: { id: movement.productId }, select: { name: true, piecesPerUnit: true } });
      const more = movement.direction === 'more';
      try {
        await inventory.applyMovement(
          {
            businessId,
            productId: movement.productId,
            type: kind === 'sale' ? (more ? InventoryTransactionType.SALE : InventoryTransactionType.RETURN_IN) : more ? InventoryTransactionType.PURCHASE : InventoryTransactionType.RETURN_OUT,
            // Ledger units: pieces for grouped products.
            quantity: movement.quantity.toFixed(),
            unit: product.piecesPerUnit ? 'PIECE' : undefined,
            note: more ? `${kind === 'sale' ? 'Sale' : 'Purchase'} ${id}` : `Edited ${kind} ${id}`,
            userId,
          },
          tx,
        );
      } catch (error) {
        if (error instanceof BadRequestException && /Insufficient stock/.test(error.message)) {
          const name = plan.productNames.get(movement.productId) ?? product.name;
          throw new ConflictException(kind === 'sale' ? `Not enough ${name} in stock for this change.` : `Not enough ${name} in stock to take off this purchase: it has already been sold or used.`);
        }
        throw error;
      }
    }

    const settlement = billEditSettlement({ amountPaid: bill.amountPaid?.toFixed() ?? null, total: plan.total.toFixed(2) });
    const refund = new Prisma.Decimal(settlement.refund);
    const revision = bill.revision + 1;
    if (refund.gt(0)) {
      const link = kind === 'sale' ? { saleId: id } : { purchaseId: id };
      const last = await tx.transactionPayment.findFirst({ where: { ...link, kind: 'PAYMENT' }, orderBy: { paidAt: 'desc' }, select: { method: true } });
      await tx.transactionPayment.create({ data: { ...link, businessId, requestId: `edit_${id}_${revision}`, amount: refund, method: input.refundMethod ?? last?.method ?? PaymentMethod.CASH, kind: 'REFUND', createdByUserId: userId } });
    }
    await plan.write(tx, { revision, editedAt: new Date(), editedByUserId: userId, editReason: reason, editRequestId: input.requestId, ...(refund.gt(0) ? { amountPaid: new Prisma.Decimal(settlement.amountPaid!) } : {}) });
  });
}
