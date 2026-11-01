import { describe, expect, it } from 'vitest';

import { inventoryMovementLabel, inventoryMovementNote, planStockAdjustment, reasonsForMode, type StockAdjustmentInput } from './stock-adjustment.js';

const base: StockAdjustmentInput = { productId: 'p1', mode: 'count', quantity: '8', reason: 'COUNT_CORRECTION', currentStock: '10', unit: 'KG' };
const plan = (input: Partial<StockAdjustmentInput>) => planStockAdjustment({ ...base, ...input });

describe('planStockAdjustment', () => {
  it('records the difference for a count, with the stock it was based on', () => {
    expect(plan({})).toEqual({ ok: true, before: 10, after: 8, change: -2, request: { productId: 'p1', type: 'ADJUSTMENT_OUT', quantity: '2', note: 'Counted 8', expectedQuantity: '10' } });
    expect(plan({ quantity: '12.5', note: ' Found a box ' })).toMatchObject({ ok: true, after: 12.5, change: 2.5, request: { type: 'ADJUSTMENT_IN', quantity: '2.5', note: 'Counted 12.5 · Found a box', expectedQuantity: '10' } });
    expect(plan({ quantity: '0', currentStock: '0.125' })).toMatchObject({ ok: true, after: 0, request: { quantity: '0.125', note: 'Counted 0', expectedQuantity: '0.125' } });
  });

  it('uses the damage or expiry movement when a count or removal is for that reason', () => {
    expect(plan({ reason: 'DAMAGE' })).toMatchObject({ ok: true, request: { type: 'DAMAGE', quantity: '2', note: 'Counted 8' } });
    expect(plan({ mode: 'remove', quantity: '3', reason: 'EXPIRED' })).toEqual({ ok: true, before: 10, after: 7, change: -3, request: { productId: 'p1', type: 'EXPIRED', quantity: '3' } });
    expect(plan({ mode: 'remove', quantity: '0.1', reason: 'COUNT_CORRECTION', currentStock: '0.3' })).toMatchObject({ ok: true, after: 0.2, request: { type: 'ADJUSTMENT_OUT', quantity: '0.1', note: 'Count correction' } });
  });

  it('adds stock for a correction or another reason with a note', () => {
    expect(plan({ mode: 'add', quantity: '5' })).toMatchObject({ ok: true, after: 15, request: { type: 'ADJUSTMENT_IN', quantity: '5', note: 'Count correction' } });
    expect(plan({ mode: 'add', quantity: '5', reason: 'OTHER', note: 'Gift from supplier' })).toMatchObject({ ok: true, request: { type: 'ADJUSTMENT_IN', note: 'Gift from supplier' } });
    expect(plan({ mode: 'add', quantity: '5', reason: 'DAMAGE' })).toEqual({ ok: false, error: 'Damage and expiry can only remove stock.' });
    expect(reasonsForMode('add')).toEqual(['COUNT_CORRECTION', 'OTHER']);
    expect(reasonsForMode('remove')).toHaveLength(4);
  });

  it('never takes stock below zero', () => {
    expect(plan({ mode: 'remove', quantity: '10.001' })).toEqual({ ok: false, error: 'Only 10 in stock, so you cannot remove 10.001.' });
    expect(plan({ mode: 'remove', quantity: '10' })).toMatchObject({ ok: true, after: 0 });
  });

  it('explains what cannot be saved', () => {
    expect(plan({ quantity: '' })).toEqual({ ok: false, error: 'Enter the counted quantity, with up to three decimal places.' });
    expect(plan({ mode: 'add', quantity: '1.2345' })).toEqual({ ok: false, error: 'Enter a quantity, with up to three decimal places.' });
    expect(plan({ mode: 'add', quantity: '0' })).toEqual({ ok: false, error: 'Enter a quantity greater than zero.' });
    expect(plan({ quantity: '10.000' })).toEqual({ ok: false, error: 'The count matches the current stock, so there is nothing to change.' });
    expect(plan({ quantity: '12', reason: 'EXPIRED' })).toMatchObject({ ok: false, error: expect.stringMatching(/only remove stock/) });
    expect(plan({ mode: 'remove', quantity: '1', reason: 'OTHER', note: '  ' })).toEqual({ ok: false, error: 'Add a note saying why the stock changed.' });
    expect(plan({ mode: 'add', quantity: '1', note: 'x'.repeat(401) })).toMatchObject({ ok: false, error: expect.stringMatching(/under 400/) });
  });

  it('keeps whole pieces for pieces, dozens and sized packs', () => {
    expect(plan({ unit: 'PIECE', quantity: '8.5' })).toEqual({ ok: false, error: 'Enter a whole number of pieces.' });
    expect(plan({ unit: 'DOZEN', quantity: '0.1' })).toEqual({ ok: false, error: 'The quantity must be a whole number of pieces.' });
    expect(plan({ unit: 'DOZEN', quantity: '9.25' })).toMatchObject({ ok: true, request: { type: 'ADJUSTMENT_OUT', quantity: '0.75' } });
    expect(plan({ unit: 'BOX', piecesPerUnit: 4, quantity: '9.3' })).toMatchObject({ ok: false });
    expect(plan({ unit: 'BOX', piecesPerUnit: 4, quantity: '9.75' })).toMatchObject({ ok: true, request: { quantity: '1', unit: 'PIECE', expectedQuantity: '40' } });
  });

  it('works a grouped product out in whole pieces, even after a single piece was sold', () => {
    // 23 pieces of a dozen, as the server shows them.
    const dozen = { unit: 'DOZEN', piecesPerUnit: 12, currentStock: '1.9166666666666666667' };
    expect(plan({ ...dozen, quantity: '2' })).toEqual({ ok: true, before: 23 / 12, after: 2, change: 1 / 12, request: { productId: 'p1', type: 'ADJUSTMENT_IN', quantity: '1', unit: 'PIECE', note: 'Counted 2', expectedQuantity: '23' } });
    expect(plan({ ...dozen, quantity: '0' })).toMatchObject({ ok: true, after: 0, request: { type: 'ADJUSTMENT_OUT', quantity: '23', unit: 'PIECE', expectedQuantity: '23' } });
    expect(plan({ ...dozen, quantity: '1.5', reason: 'DAMAGE' })).toMatchObject({ ok: true, request: { type: 'DAMAGE', quantity: '5', unit: 'PIECE', expectedQuantity: '23' } });
    expect(plan({ ...dozen, mode: 'remove', quantity: '1.75' })).toEqual({ ok: true, before: 23 / 12, after: 2 / 12, change: -21 / 12, request: { productId: 'p1', type: 'ADJUSTMENT_OUT', quantity: '21', unit: 'PIECE', note: 'Count correction' } });
    expect(plan({ ...dozen, mode: 'remove', quantity: '2' })).toEqual({ ok: false, error: 'Only 23 pieces in stock, so you cannot remove 24 pieces.' });
    expect(plan({ ...dozen, mode: 'add', quantity: '0.25' })).toMatchObject({ ok: true, request: { quantity: '3', unit: 'PIECE' } });
    // A box of 7 with 10 pieces left.
    expect(plan({ unit: 'BOX', piecesPerUnit: 7, currentStock: String(10 / 7), quantity: '1' })).toMatchObject({ ok: true, after: 1, request: { type: 'ADJUSTMENT_OUT', quantity: '3', unit: 'PIECE', expectedQuantity: '10' } });
  });

  it('keeps large quantities exact', () => {
    expect(plan({ quantity: '999999999.999', currentStock: '0.001' })).toMatchObject({ ok: true, request: { quantity: '999999999.998', expectedQuantity: '0.001' } });
  });
});

describe('inventoryMovementLabel', () => {
  it('names every movement type in plain words', () => {
    expect(['OPENING_STOCK', 'PURCHASE', 'SALE', 'RETURN_IN', 'RETURN_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRED'].map(inventoryMovementLabel)).toEqual([
      'Opening stock', 'Purchase', 'Sale', 'Returned to stock', 'Returned to supplier', 'Stock added', 'Stock removed', 'Damaged', 'Expired',
    ]);
    expect(inventoryMovementLabel('NEW_KIND')).toBe('New kind');
  });
});

describe('inventoryMovementNote', () => {
  it('hides record ids and keeps what people wrote', () => {
    expect(inventoryMovementNote('Sale cmabc123')).toBe('');
    expect(inventoryMovementNote('Purchase cmabc123')).toBe('');
    expect(inventoryMovementNote('Cancelled sale cmabc123')).toBe('Cancelled sale');
    expect(inventoryMovementNote('Edited purchase cmabc123')).toBe('Edited purchase');
    expect(inventoryMovementNote('Counted 8 · Two cracked sheets')).toBe('Counted 8 · Two cracked sheets');
    expect(inventoryMovementNote('Sale to Patil was short')).toBe('Sale to Patil was short');
    expect(inventoryMovementNote(null)).toBe('');
  });
});
