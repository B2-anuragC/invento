import { describe, expect, it } from 'vitest';
import { supplierOffersProduct } from './supplier-catalog';
describe('Supplier product selection', () => {
  const product = { id: 'glass', category: 'Glass' };
  it('waits for a selected supplier', () => expect(supplierOffersProduct(undefined, product)).toBe(false));
  it('keeps unconfigured suppliers compatible with the complete catalog', () => expect(supplierOffersProduct({}, product)).toBe(true));
  it('matches either categories or explicit products', () => {
    expect(supplierOffersProduct({ categories: ['Glass'], productIds: [] }, product)).toBe(true);
    expect(supplierOffersProduct({ categories: ['Hardware'], productIds: ['glass'] }, product)).toBe(true);
    expect(supplierOffersProduct({ categories: ['Hardware'], productIds: [] }, product)).toBe(false);
  });
});
