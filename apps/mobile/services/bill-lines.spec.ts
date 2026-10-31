import { describe, expect, it } from 'vitest';

import { decodeDraftLines, encodeDraftLines, lineKey, sameLine, type BillLine } from './bill-lines';

const prices: Record<string, string> = { handle: '180', glass: '90' };
const priceFor = (id: string) => prices[id];

describe('bill line identity', () => {
  it('treats a pack and loose pieces of one product as different lines', () => {
    expect(lineKey({ productId: 'handle' })).toBe('handle');
    expect(lineKey({ productId: 'handle', optionId: 'pack' })).toBe('handle::pack');
    expect(sameLine({ productId: 'handle' }, { productId: 'handle', optionId: 'pack' })).toBe(false);
    expect(sameLine({ productId: 'handle', optionId: 'pack' }, { productId: 'handle', optionId: 'pack' })).toBe(true);
  });
});

describe('draft lines', () => {
  it('round-trips a pack and loose pieces of the same product', () => {
    const lines: BillLine[] = [
      { productId: 'handle', optionId: 'pack', quantity: '1', price: '1700' },
      { productId: 'handle', quantity: '3', price: '180' },
      { productId: 'glass', quantity: '12.5', price: '95' },
    ];
    expect(decodeDraftLines(encodeDraftLines(lines), priceFor)).toEqual([
      { productId: 'handle', optionId: 'pack', quantity: '1', price: '1700' },
      { productId: 'handle', optionId: undefined, quantity: '3', price: '180' },
      { productId: 'glass', optionId: undefined, quantity: '12.5', price: '95' },
    ]);
  });

  it('reads drafts saved before lines were keyed by option', () => {
    const older = { quantities: { handle: '2' }, prices: { handle: '1700' }, selectedOptions: { handle: 'pack' } };
    expect(decodeDraftLines(older, priceFor)).toEqual([{ productId: 'handle', optionId: 'pack', quantity: '2', price: '1700' }]);
  });

  it('drops products that no longer exist and fills missing prices', () => {
    const draft = { quantities: { removed: '1', glass: '2' }, prices: {} };
    expect(decodeDraftLines(draft, priceFor)).toEqual([{ productId: 'glass', optionId: undefined, quantity: '2', price: '90' }]);
  });
});
