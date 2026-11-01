import { describe, expect, it } from 'vitest';
import { stockValue } from './stock-value';

describe('Stock value', () => {
  const products = [
    { id: 'glass', status: 'ACTIVE', purchasePrice: '40.50', sellingPrice: '55' },
    { id: 'handle', status: 'ACTIVE', purchasePrice: '1200', sellingPrice: '1500' },
    { id: 'old', status: 'INACTIVE', purchasePrice: '10', sellingPrice: '20' },
    { id: 'new', status: 'ACTIVE', purchasePrice: '5', sellingPrice: '9' },
  ];
  const inventory = [{ productId: 'glass', quantity: '10' }, { productId: 'handle', quantity: '1.916666667' }, { productId: 'old', quantity: '4' }];

  it('values active stock at cost and at selling price, before GST', () => {
    // 23 pieces of a dozen product: 1.9166… dozen at the per-dozen price.
    expect(stockValue(products, inventory, true)).toEqual({ atCost: 2705, atSellingPrice: 3425 });
  });

  it('never gives the cost to members who cannot see purchase prices', () => {
    const hidden = products.map(({ purchasePrice: _purchasePrice, ...product }) => product);
    expect(stockValue(hidden, inventory, false)).toEqual({ atCost: null, atSellingPrice: 3425 });
    expect(stockValue(products, inventory, false).atCost).toBeNull();
  });

  it('is zero with no stock', () => {
    expect(stockValue(products, [], true)).toEqual({ atCost: 0, atSellingPrice: 0 });
  });
});
