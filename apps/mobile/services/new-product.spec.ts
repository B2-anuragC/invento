import { describe, expect, it } from 'vitest';

import { addedProductNotice, openingStockError, receiveAddedProduct, sendAddedProduct } from './new-product';

describe('added product handoff', () => {
  it('is received once', () => {
    sendAddedProduct({ id: 'p1', name: 'Glass', notice: 'Product added: Glass.' });
    expect(receiveAddedProduct()).toEqual({ id: 'p1', name: 'Glass', notice: 'Product added: Glass.' });
    expect(receiveAddedProduct()).toBeNull();
  });
});

describe('openingStockError', () => {
  it('accepts an empty field and valid quantities', () => {
    expect(openingStockError('', 'PIECE')).toBe('');
    expect(openingStockError('0', 'PIECE')).toBe('');
    expect(openingStockError('25', 'PIECE')).toBe('');
    expect(openingStockError('12.375', 'SQFT')).toBe('');
    expect(openingStockError('1.5', 'BOX', 10)).toBe('');
  });
  it('rejects malformed quantities, part pieces and part grouped pieces', () => {
    expect(openingStockError('.', 'SQFT')).toMatch(/three decimal places/);
    expect(openingStockError('1.2345', 'SQFT')).toMatch(/three decimal places/);
    expect(openingStockError('2.5', 'PIECE')).toMatch(/whole number of pieces/);
    expect(openingStockError('1.25', 'BOX', 10)).toMatch(/whole number of pieces/);
  });
});

describe('addedProductNotice', () => {
  it('says the product was added and how opening stock went', () => {
    expect(addedProductNotice('Glass', 'PIECE', { quantity: '25' }, true)).toBe('Product added: Glass. Opening stock 25 pieces.');
    expect(addedProductNotice('Glass', 'PIECE', { quantity: '25', error: 'No connection' }, true)).toBe('Product added: Glass. The opening stock was not recorded (No connection). Open the product to record it.');
    expect(addedProductNotice('Glass', 'PIECE', null, true)).toBe('Product added: Glass. Open it to record its opening stock before selling it.');
    expect(addedProductNotice('Glass', 'PIECE', null, false)).toBe('Product added: Glass.');
  });
});
