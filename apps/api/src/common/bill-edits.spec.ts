import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { vi } from 'vitest';
import { applyBillEdit, billStockEffect, stockEditMovements, type BillEditPlan } from './bill-edits.js';
import type { InventoryService } from '../inventory/inventory.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const D = (value: string | number) => new Prisma.Decimal(value);
const map = (entries: Record<string, number>) => new Map(Object.entries(entries).map(([key, value]) => [key, D(value)]));

describe('billStockEffect', () => {
  it('nets a bill\'s own movements and its edits per product', () => {
    const sale = billStockEffect('sale', [{ productId: 'p1', quantity: D(-5) }, { productId: 'p1', quantity: D(2) }, { productId: 'p2', quantity: D(-1) }, { productId: 'p2', quantity: D(1) }]);
    expect([...sale].map(([id, quantity]) => [id, quantity.toString()])).toEqual([['p1', '3']]);
    const purchase = billStockEffect('purchase', [{ productId: 'p1', quantity: D(10) }, { productId: 'p1', quantity: D(-4) }]);
    expect(purchase.get('p1')?.toString()).toBe('6');
  });
});

describe('stockEditMovements', () => {
  it('moves only the difference, one movement per product in product order', () => {
    const moves = stockEditMovements(map({ p2: 5, p1: 3, p3: 1 }), map({ p1: 3, p2: 2, p4: 4 }));
    expect(moves.map((move) => [move.productId, move.direction, move.quantity.toString()])).toEqual([['p2', 'less', '3'], ['p3', 'less', '1'], ['p4', 'more', '4']]);
  });
});

/** A fake transaction client around one locked bill row. */
function harness(bill: { status?: string; revision?: number; amountPaid?: string | null; returnedTotal?: string; editRequestId?: string | null; returns?: number; ledger?: { productId: string; quantity: Prisma.Decimal }[] } = {}) {
  const row = { status: bill.status ?? 'COMPLETED', revision: bill.revision ?? 1, amountPaid: bill.amountPaid === null ? null : D(bill.amountPaid ?? '1180.00'), returnedTotal: D(bill.returnedTotal ?? '0'), editRequestId: bill.editRequestId ?? null };
  const payments: Record<string, unknown>[] = [];
  const tx = {
    $queryRaw: vi.fn(async () => [row]),
    saleReturn: { count: vi.fn(async () => bill.returns ?? 0) },
    purchaseReturn: { count: vi.fn(async () => bill.returns ?? 0) },
    inventoryTransaction: { findMany: vi.fn(async () => bill.ledger ?? [{ productId: 'p1', quantity: D(-2) }]) },
    product: { findUniqueOrThrow: vi.fn(async () => ({ name: 'Glass', piecesPerUnit: null })) },
    transactionPayment: { findFirst: vi.fn(async () => ({ method: 'UPI' })), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => payments.push(data)) },
  };
  const prisma = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) } as unknown as PrismaService;
  const inventory = { applyMovement: vi.fn(async () => ({})) };
  const write = vi.fn(async () => undefined);
  const plan = (overrides: Partial<BillEditPlan> = {}): BillEditPlan => ({ revision: 1, total: D('590.00'), stock: map({ p1: 1 }), productNames: new Map([['p1', 'Glass']]), write, ...overrides });
  return { tx, prisma, inventory, inventoryService: inventory as unknown as InventoryService, write, plan, payments };
}

const input = { requestId: 'edit_request_1', reason: ' Wrong quantity ' };

describe('applyBillEdit', () => {
  it('moves stock by the difference, refunds money paid above the new total and raises the revision', async () => {
    const h = harness();
    await applyBillEdit(h.prisma, h.inventoryService, 'sale', 'b1', 'u1', 's1', input, h.plan());
    expect(h.inventory.applyMovement).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p1', type: 'RETURN_IN', quantity: '1', note: 'Edited sale s1' }), h.tx);
    expect(h.payments).toEqual([expect.objectContaining({ saleId: 's1', requestId: 'edit_s1_2', kind: 'REFUND', amount: D('590.00'), method: 'UPI' })]);
    expect(h.write).toHaveBeenCalledWith(h.tx, expect.objectContaining({ revision: 2, editedByUserId: 'u1', editReason: 'Wrong quantity', editRequestId: 'edit_request_1', amountPaid: D('590.00') }));
  });

  it('records the refund in the method chosen, and none when the new total is higher', async () => {
    const h = harness({ amountPaid: '1180.00' });
    await applyBillEdit(h.prisma, h.inventoryService, 'purchase', 'b1', 'u1', 'p9', { ...input, refundMethod: 'CASH' }, h.plan({ total: D('1000.00'), stock: map({}) , }));
    expect(h.payments).toEqual([expect.objectContaining({ purchaseId: 'p9', amount: D('180.00'), method: 'CASH' })]);
    const higher = harness({ amountPaid: '100.00', ledger: [] });
    await applyBillEdit(higher.prisma, higher.inventoryService, 'sale', 'b1', 'u1', 's1', input, higher.plan({ total: D('2000.00'), stock: map({ p1: 3 }) }));
    expect(higher.payments).toEqual([]);
    expect(higher.inventory.applyMovement).toHaveBeenCalledWith(expect.objectContaining({ type: 'SALE', quantity: '3', note: 'Sale s1' }), higher.tx);
    expect(higher.write).toHaveBeenCalledWith(higher.tx, expect.not.objectContaining({ amountPaid: expect.anything() }));
  });

  it('changes nothing when the same request is retried', async () => {
    const h = harness({ editRequestId: 'edit_request_1', revision: 2 });
    await applyBillEdit(h.prisma, h.inventoryService, 'sale', 'b1', 'u1', 's1', input, h.plan());
    expect(h.inventory.applyMovement).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });

  it('refuses cancelled bills, bills with returns and a bill changed since it was priced', async () => {
    for (const [bill, message] of [
      [{ status: 'CANCELLED' }, 'A cancelled bill cannot be edited.'],
      [{ returns: 1 }, /has returns/],
      [{ revision: 3 }, /changed while you were editing/],
    ] as const) {
      const h = harness(bill);
      await expect(applyBillEdit(h.prisma, h.inventoryService, 'sale', 'b1', 'u1', 's1', input, h.plan())).rejects.toThrow(message);
      expect(h.write).not.toHaveBeenCalled();
    }
  });

  it('turns a stock shortage into a conflict naming the product', async () => {
    const h = harness({ ledger: [{ productId: 'p1', quantity: D(10) }] });
    h.inventory.applyMovement.mockRejectedValueOnce(new BadRequestException('Insufficient stock for this operation.'));
    const edit = applyBillEdit(h.prisma, h.inventoryService, 'purchase', 'b1', 'u1', 'p9', input, h.plan({ stock: map({ p1: 4 }) }));
    await expect(edit).rejects.toBeInstanceOf(ConflictException);
    await expect(applyBillEdit(h.prisma, h.inventoryService, 'purchase', 'b1', 'u1', 'p9', { ...input, reason: '  ' }, h.plan())).rejects.toThrow('Enter why this bill is edited.');
  });
});
