import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, PaymentMethod, Prisma } from '@prisma/client';
import type { InventoryService } from '../inventory/inventory.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CancelTransactionDto } from './dto/transaction-finance.dto.js';

/**
 * Cancels a completed sale or purchase in one transaction: its stock movements
 * are reversed through the inventory engine, money already paid is refunded
 * with a REFUND entry, and the bill keeps its number with status CANCELLED.
 * Cancelling a bill that is already cancelled changes nothing, so a retry is safe.
 */
export async function cancelTransaction(prisma: PrismaService, inventory: InventoryService, kind: 'sale' | 'purchase', businessId: string, userId: string, id: string, input: CancelTransactionDto) {
  const reason = input.reason.trim();
  await prisma.$transaction(async (tx) => {
    const [record] = await tx.$queryRaw<{ status: string; amountPaid: Prisma.Decimal | null }[]>(
      Prisma.sql`SELECT status, "amountPaid" FROM ${Prisma.raw(kind === 'sale' ? 'sales' : 'purchases')} WHERE id = ${id} AND "businessId" = ${businessId} FOR UPDATE`,
    );
    if (!record) throw new NotFoundException(kind === 'sale' ? 'Sale not found.' : 'Purchase not found.');
    if (record.status === 'CANCELLED') return;
    if (record.status !== 'COMPLETED') throw new ConflictException('Only a completed bill can be cancelled.');
    // Its stock and money have partly been settled by credit or debit notes already.
    const returns = kind === 'sale' ? await tx.saleReturn.count({ where: { saleId: id } }) : await tx.purchaseReturn.count({ where: { purchaseId: id } });
    if (returns > 0) throw new ConflictException('This bill has returns, so it cannot be cancelled. Return the remaining items instead.');

    // The bill's own ledger rows, replayed in the other direction in product order (stock lock order).
    const movements = await tx.inventoryTransaction.findMany({
      where: { businessId, note: `${kind === 'sale' ? 'Sale' : 'Purchase'} ${id}` },
      include: { product: { select: { piecesPerUnit: true } } },
      orderBy: [{ productId: 'asc' }, { createdAt: 'asc' }],
    });
    for (const movement of movements) {
      try {
        await inventory.applyMovement(
          {
            businessId,
            productId: movement.productId,
            type: kind === 'sale' ? InventoryTransactionType.RETURN_IN : InventoryTransactionType.RETURN_OUT,
            // Ledger quantities are in stored units: pieces for grouped products.
            quantity: movement.quantity.abs().toString(),
            unit: movement.product.piecesPerUnit ? 'PIECE' : undefined,
            note: `Cancelled ${kind} ${id}`,
            userId,
          },
          tx,
        );
      } catch (error) {
        if (kind === 'purchase' && error instanceof BadRequestException && /Insufficient stock/.test(error.message)) {
          throw new ConflictException('Stock from this purchase has already been sold or used, so the purchase cannot be cancelled.');
        }
        throw error;
      }
    }

    const link = kind === 'sale' ? { saleId: id } : { purchaseId: id };
    const paid = record.amountPaid ?? new Prisma.Decimal(0);
    if (paid.gt(0)) {
      const last = await tx.transactionPayment.findFirst({ where: { ...link, kind: 'PAYMENT' }, orderBy: { paidAt: 'desc' }, select: { method: true } });
      await tx.transactionPayment.create({ data: { ...link, businessId, requestId: `refund_${id}`, amount: paid, method: input.refundMethod ?? last?.method ?? PaymentMethod.CASH, kind: 'REFUND', createdByUserId: userId } });
    }
    const cancelled = { status: 'CANCELLED' as const, cancelledAt: new Date(), cancelledByUserId: userId, cancelReason: reason, ...(paid.gt(0) ? { amountPaid: new Prisma.Decimal(0) } : {}) };
    if (kind === 'sale') await tx.sale.update({ where: { id }, data: cancelled });
    else await tx.purchase.update({ where: { id }, data: cancelled });
  });
}
