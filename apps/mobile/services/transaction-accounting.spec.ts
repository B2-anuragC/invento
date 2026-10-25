import { describe, it, expect } from 'vitest';
import { transactionTotals, paymentBalance, validDueDate } from './transaction-accounting';
describe('Transaction accounting preview', () => {
  it('preserves decimal quantities and rounds each tax line', () => {
    expect(transactionTotals([{ quantity: 0.8, price: 50, product: { gstRate: '18' } }, { quantity: 2, price: 40, product: { gstRate: '5' } }])).toEqual({ subtotal: 120, tax: 11.2, total: 131.2 });
    expect(paymentBalance({ total: '100', amountPaid: null })).toBeNull();
    expect(paymentBalance({ total: '100', amountPaid: '30' })).toBe(70);
    expect(validDueDate('2026-02-30')).toBe(false);
  });
});
