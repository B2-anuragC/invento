import { describe, expect, it } from 'vitest';

import { paymentMethodLabel, paymentMethodsSummary } from './payment-methods';

describe('paymentMethodLabel', () => {
  it('reads like a word, not a stored code', () => {
    expect(paymentMethodLabel('CASH')).toBe('Cash');
    expect(paymentMethodLabel('UPI')).toBe('UPI');
    expect(paymentMethodLabel('BANK_TRANSFER')).toBe('Bank transfer');
    expect(paymentMethodLabel('CHEQUE_DEPOSIT')).toBe('Cheque deposit');
  });
});

describe('paymentMethodsSummary', () => {
  it('lists every method used, once each, in order of first use', () => {
    const payments = [{ method: 'UPI' }, { method: 'CASH' }, { method: 'UPI' }];
    expect(paymentMethodsSummary(payments, 'UPI')).toBe('UPI + Cash');
  });

  it('ignores a confirmed opening balance', () => {
    expect(paymentMethodsSummary([{ kind: 'OPENING_BALANCE', method: 'OTHER' }, { kind: 'PAYMENT', method: 'CARD' }], 'CASH')).toBe('Card');
  });

  it('falls back to the method chosen when the bill was saved', () => {
    expect(paymentMethodsSummary([], 'BANK_TRANSFER')).toBe('Bank transfer');
    expect(paymentMethodsSummary(undefined, 'CASH')).toBe('Cash');
    expect(paymentMethodsSummary([{ kind: 'OPENING_BALANCE', method: 'OTHER' }], 'UPI')).toBe('UPI');
  });

  it('is empty when nothing is known', () => {
    expect(paymentMethodsSummary(null, null)).toBe('');
  });
});
