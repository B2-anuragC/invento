import { planStockAdjustment } from '@invento/shared';
import { describe, expect, it } from 'vitest';

import { receiveStockNotice, sendStockNotice, stockChangePreview, stockSavedNotice } from './stock-adjustment';

const saved = (mode: 'count' | 'add' | 'remove', quantity: string) => {
  const plan = planStockAdjustment({ productId: 'p1', mode, quantity, reason: 'COUNT_CORRECTION', currentStock: '8', unit: 'KG' });
  if (!plan.ok) throw new Error(plan.error);
  return plan;
};

describe('stock adjustment wording', () => {
  it('previews the change and says what was saved', () => {
    expect(stockChangePreview(saved('count', '6'), 'KG')).toBe('8 kg → 6 kg (2 kg removed)');
    expect(stockChangePreview(saved('add', '1.5'), 'KG')).toBe('8 kg → 9.5 kg (1.5 kg added)');
    expect(stockSavedNotice('Float glass', saved('remove', '8'), 'KG')).toBe('Stock updated: Float glass is now 0 kg (8 kg removed).');
  });
});

describe('stock notice handoff', () => {
  it('is taken once, and only by the screen it is for', () => {
    sendStockNotice({ productId: 'p1', text: 'Stock updated' });
    expect(receiveStockNotice('p2')).toBeNull();
    expect(receiveStockNotice('p1')).toEqual({ productId: 'p1', text: 'Stock updated' });
    expect(receiveStockNotice()).toBeNull();
    sendStockNotice({ productId: 'p3', text: 'Again' });
    expect(receiveStockNotice()).toEqual({ productId: 'p3', text: 'Again' });
  });
});
