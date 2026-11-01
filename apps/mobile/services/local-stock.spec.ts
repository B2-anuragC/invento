import { planStockAdjustment } from '@invento/shared';
import { describe, expect, it } from 'vitest';

import { applyLocalAdjustment, localProductStock } from './local-stock';
import type { OfflineSnapshot } from './offline-model';

const now = '2026-11-01T10:00:00.000Z';
function shop(quantity: number | string, product: Record<string, unknown> = { unit: 'PIECE' }): OfflineSnapshot {
  return {
    schemaVersion: 1,
    business: { id: 'shop', name: 'Shop' },
    access: { role: 'OWNER', membersCanViewPurchasePrice: true, permissions: [] },
    products: [{ id: 'p1', name: 'Hinge', ...product } as never],
    customers: [], suppliers: [], sales: [], purchases: [],
    inventory: [{ productId: 'p1', quantity, createdAt: '2026-10-01T00:00:00.000Z' } as never],
    inventoryActivity: [],
    downloadedAt: now,
  } as OfflineSnapshot;
}
const adjust = (snapshot: OfflineSnapshot, request: Record<string, unknown>) => applyLocalAdjustment(snapshot, { id: 'm1', productId: 'p1', ...request } as never, now);

describe('applyLocalAdjustment', () => {
  it('adds, removes and records the movement with its note, like the server', () => {
    const snapshot = shop('10');
    expect(adjust(snapshot, { type: 'ADJUSTMENT_IN', quantity: '2.5' })).toMatchObject({ type: 'ADJUSTMENT_IN', quantity: 2.5, balanceAfter: 12.5, note: null });
    expect(adjust(snapshot, { type: 'DAMAGE', quantity: '0.125', note: ' Broken in transit ' })).toMatchObject({ type: 'DAMAGE', quantity: -0.125, balanceAfter: 12.375, note: 'Broken in transit' });
    expect(snapshot.inventory[0].quantity).toBe(12.375);
    expect(snapshot.inventoryActivity.map((entry) => entry.type)).toEqual(['DAMAGE', 'ADJUSTMENT_IN']);
  });

  it('records a count planned by the shared rules', () => {
    const snapshot = shop('10');
    const plan = planStockAdjustment({ productId: 'p1', mode: 'count', quantity: '7', reason: 'COUNT_CORRECTION', currentStock: '10', unit: 'PIECE' });
    if (!plan.ok) throw new Error(plan.error);
    expect(adjust(snapshot, plan.request)).toMatchObject({ type: 'ADJUSTMENT_OUT', quantity: -3, balanceAfter: 7 });
  });

  it('refuses a count when stock moved since it was shown', () => {
    const snapshot = shop('10');
    expect(() => adjust(snapshot, { type: 'ADJUSTMENT_OUT', quantity: '3', expectedQuantity: '9' })).toThrow('Stock changed while you were counting: it is now 10. Check the count and try again.');
    expect(snapshot.inventory[0].quantity).toBe('10');
  });

  it('keeps a product sold by the dozen in whole pieces', () => {
    // 23 pieces show as 1.91666… dozen; a count in pieces compares exactly.
    const snapshot = shop(23 / 12, { unit: 'DOZEN', piecesPerUnit: 12 });
    expect(adjust(snapshot, { type: 'ADJUSTMENT_OUT', quantity: '3', unit: 'PIECE', expectedQuantity: '23' })).toMatchObject({ quantity: -0.25, balanceAfter: 20 / 12 });
    expect(() => adjust(snapshot, { type: 'ADJUSTMENT_OUT', quantity: '1', unit: 'PIECE', expectedQuantity: '23' })).toThrow('it is now 20 pieces');
    expect(() => adjust(snapshot, { type: 'ADJUSTMENT_IN', quantity: '0.1' })).toThrow('Grouped stock must represent a whole number of pieces.');
    expect(adjust(snapshot, { type: 'ADJUSTMENT_IN', quantity: '1' })).toMatchObject({ balanceAfter: 32 / 12 });
  });

  it('refuses what the server refuses', () => {
    expect(() => adjust(shop('2'), { type: 'ADJUSTMENT_OUT', quantity: '3' })).toThrow('Insufficient stock for this operation.');
    expect(() => adjust(shop('2'), { type: 'ADJUSTMENT_IN', quantity: '0' })).toThrow('greater than zero');
    expect(() => adjust(shop('2'), { type: 'ADJUSTMENT_IN', quantity: '1.0005' })).toThrow('Inventory quantity must be finite');
    expect(() => adjust(shop('2'), { type: 'SALE', quantity: '1' })).toThrow('valid adjustment type');
    expect(() => adjust(shop('2'), { type: 'ADJUSTMENT_IN', quantity: '1', unit: 'DOZEN' })).toThrow('Unsupported inventory movement unit');
    const noOpening = shop('0');
    noOpening.inventory = [];
    expect(() => adjust(noOpening, { type: 'ADJUSTMENT_IN', quantity: '1' })).toThrow('Opening stock must be recorded before adjustments can be made.');
    expect(() => applyLocalAdjustment(shop('2'), { id: 'm', productId: 'missing', type: 'ADJUSTMENT_IN', quantity: '1' }, now)).toThrow('Product not found.');
  });
});

describe('localProductStock', () => {
  it('returns recorded stock with a date, and no dates before opening stock', () => {
    expect(localProductStock(shop('4'), 'p1', now)).toMatchObject({ productId: 'p1', quantity: '4', createdAt: '2026-10-01T00:00:00.000Z' });
    const fromBill = shop(3);
    fromBill.inventory = [{ productId: 'p1', quantity: 3 } as never];
    expect(localProductStock(fromBill, 'p1', now).createdAt).toBe(now);
    const none = shop('0');
    none.inventory = [];
    expect(localProductStock(none, 'p1', now)).toEqual({ productId: 'p1', quantity: '0', createdAt: null, updatedAt: null });
  });
});
