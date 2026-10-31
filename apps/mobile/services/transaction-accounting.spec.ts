import { describe, it, expect } from 'vitest';
import { saleDiscountInput, transactionTotals, paymentBalance, validDueDate } from './transaction-accounting';
describe('Transaction accounting preview', () => {
  it('preserves decimal quantities and rounds each tax line', () => {
    expect(transactionTotals([{ quantity: 0.8, price: 50, product: { gstRate: '18' } }, { quantity: 2, price: 40, product: { gstRate: '5' } }])).toEqual({ subtotal: 120, discount: 0, tax: 11.2, total: 131.2 });
    expect(paymentBalance({ total: '100', amountPaid: null })).toBeNull();
    expect(paymentBalance({ total: '100', amountPaid: '30' })).toBe(70);
    expect(validDueDate('2026-02-30')).toBe(false);
  });

  it('matches the API for a discount split before GST', () => {
    const items = [{ quantity: 1, price: 1000, product: { gstRate: '18' } }, { quantity: 1, price: 200, product: { gstRate: '5' } }];
    expect(transactionTotals(items, { discountPercent: '10' })).toEqual({ subtotal: 1200, discount: 120, tax: 171, total: 1251 });
    expect(transactionTotals(items, { discountAmount: '0.01' })).toEqual({ subtotal: 1200, discount: 0.01, tax: 190, total: 1389.99 });
  });

  it('rounds each line half-up to the paisa like the API', () => {
    expect(transactionTotals([{ quantity: 0.125, price: 0.12, product: { gstRate: '18' } }])).toEqual({ subtotal: 0.02, discount: 0, tax: 0, total: 0.02 });
    expect(transactionTotals([{ quantity: 3, price: 33.33, product: { gstRate: '12.5' } }])).toEqual({ subtotal: 99.99, discount: 0, tax: 12.5, total: 112.49 });
  });

  it('turns the typed discount into what the API takes', () => {
    expect(saleDiscountInput('amount', '')).toEqual({});
    expect(saleDiscountInput('amount', '120.')).toEqual({ discountAmount: '120' });
    expect(saleDiscountInput('percent', '12.5')).toEqual({ discountPercent: '12.5' });
  });

  it('ignores a discount that cannot apply and quantities still being typed', () => {
    const items = [{ quantity: 2, price: 50, product: { gstRate: '0' } }];
    expect(transactionTotals(items, { discountAmount: '150' })).toEqual({ subtotal: 100, discount: 0, tax: 0, total: 100 });
    expect(transactionTotals([...items, { quantity: Number.NaN, price: 10, product: {} }])).toEqual({ subtotal: 100, discount: 0, tax: 0, total: 100 });
  });
});
