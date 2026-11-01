import { describe, expect, it } from 'vitest';

import { NOTHING_RETURNED, returnableQuantity, returnLineAmounts, returnQuantityError, returnSettlement, sumAmounts, sumQuantities } from './returns.js';

describe('returnQuantityError', () => {
  it('allows up to what is left on the line', () => {
    expect(returnQuantityError('10', '0', '10')).toBe('');
    expect(returnQuantityError('10', '7.5', '2.5')).toBe('');
    expect(returnQuantityError('10', '7.5', '2.501')).toBe('Only 2.5 can be returned.');
    expect(returnQuantityError('3', '3', '1')).toBe('This item has already been returned in full.');
  });

  it('needs a positive quantity with up to three decimals', () => {
    for (const quantity of ['0', '0.000', '-1', '1.2345', 'abc', '']) expect(returnQuantityError('10', '0', quantity)).toMatch(/greater than zero/);
  });
});

describe('returnableQuantity', () => {
  it('trims trailing zeros and never goes below zero', () => {
    expect(returnableQuantity('10.000', '2.250')).toBe('7.75');
    expect(returnableQuantity('2', '2')).toBe('0');
    expect(returnableQuantity('2', '3')).toBe('0');
  });
});

describe('returnLineAmounts', () => {
  // 3 × ₹33.33 = 99.99, ₹10.00 of the bill discount, 18% GST on 89.99 = 16.20.
  const line = { quantity: '3', lineTotal: '99.99', discountAmount: '10.00', taxAmount: '16.20' };

  it('reverses the amount, discount share and GST in proportion', () => {
    expect(returnLineAmounts(line, NOTHING_RETURNED, '1')).toEqual({ lineTotal: '33.33', discountAmount: '3.33', taxAmount: '5.40', total: '35.40' });
  });

  it('gives the last return exactly what is left, so returns add up to the line', () => {
    const first = returnLineAmounts(line, NOTHING_RETURNED, '1');
    const second = returnLineAmounts(line, { quantity: '1', ...first }, '1');
    const before = { quantity: '2', lineTotal: sumAmounts([first.lineTotal, second.lineTotal]), discountAmount: sumAmounts([first.discountAmount, second.discountAmount]), taxAmount: sumAmounts([first.taxAmount, second.taxAmount]) };
    const last = returnLineAmounts(line, before, '1');
    expect(sumAmounts([first.lineTotal, second.lineTotal, last.lineTotal])).toBe('99.99');
    expect(sumAmounts([first.discountAmount, second.discountAmount, last.discountAmount])).toBe('10.00');
    expect(sumAmounts([first.taxAmount, second.taxAmount, last.taxAmount])).toBe('16.20');
    expect(sumAmounts([first.total, second.total, last.total])).toBe('106.19');
    // The running share rounds half-up: 2/3 of 10.00 is 6.666… → 6.67, so the second return takes 3.34.
    expect(second.discountAmount).toBe('3.34');
  });

  it('never gives a return more discount than line total, or a negative one', () => {
    const line = { quantity: '3', lineTotal: '1.01', discountAmount: '1.00', taxAmount: '0' };
    const first = returnLineAmounts(line, NOTHING_RETURNED, '1');
    const second = returnLineAmounts(line, { quantity: '1', ...first }, '1');
    expect(second).toEqual({ lineTotal: '0.33', discountAmount: '0.33', taxAmount: '0.00', total: '0.00' });
    // Every split of small lines, one unit at a time: each return stays valid and they add up to the line.
    for (const sold of [2, 3, 6, 7]) for (let lineTotal = 0; lineTotal <= 40; lineTotal++) for (let discount = 0; discount <= lineTotal; discount++) {
      const bill = { quantity: String(sold), lineTotal: (lineTotal / 100).toFixed(2), discountAmount: (discount / 100).toFixed(2), taxAmount: '0.07' };
      let taken = { ...NOTHING_RETURNED };
      for (let unit = 1; unit <= sold; unit++) {
        const amounts = returnLineAmounts(bill, taken, '1');
        expect(Number(amounts.discountAmount)).toBeGreaterThanOrEqual(0);
        expect(Number(amounts.discountAmount)).toBeLessThanOrEqual(Number(amounts.lineTotal));
        expect(Number(amounts.total)).toBeGreaterThanOrEqual(0);
        taken = { quantity: String(unit), lineTotal: sumAmounts([taken.lineTotal, amounts.lineTotal]), discountAmount: sumAmounts([taken.discountAmount, amounts.discountAmount]), taxAmount: sumAmounts([taken.taxAmount, amounts.taxAmount]) };
      }
      expect(taken).toEqual({ quantity: String(sold), lineTotal: bill.lineTotal, discountAmount: bill.discountAmount, taxAmount: '0.07' });
    }
  });

  it('works in thousandths of a unit and handles lines without a discount', () => {
    const purchase = { quantity: '2.5', lineTotal: '100.00', taxAmount: '5.00' };
    expect(returnLineAmounts(purchase, NOTHING_RETURNED, '0.001')).toEqual({ lineTotal: '0.04', discountAmount: '0.00', taxAmount: '0.00', total: '0.04' });
    expect(returnLineAmounts(purchase, NOTHING_RETURNED, '2.5')).toEqual({ lineTotal: '100.00', discountAmount: '0.00', taxAmount: '5.00', total: '105.00' });
  });

  it('refuses more than is left', () => {
    expect(() => returnLineAmounts(line, { ...NOTHING_RETURNED, quantity: '2.5' }, '0.501')).toThrow(RangeError);
  });
});

describe('returnSettlement', () => {
  it('reduces what is owed first and refunds the rest', () => {
    expect(returnSettlement({ netTotal: '1000.00', amountPaid: '1000.00', returnTotal: '250.00' })).toEqual({ balanceReduction: '0.00', refund: '250.00' });
    expect(returnSettlement({ netTotal: '1000.00', amountPaid: '0', returnTotal: '250.00' })).toEqual({ balanceReduction: '250.00', refund: '0.00' });
    expect(returnSettlement({ netTotal: '1000.00', amountPaid: '900.00', returnTotal: '250.00' })).toEqual({ balanceReduction: '100.00', refund: '150.00' });
    expect(returnSettlement({ netTotal: '1000.00', amountPaid: null, returnTotal: '250.00' })).toEqual({ balanceReduction: '250.00', refund: '0.00' });
  });
});

describe('sums', () => {
  it('adds exactly', () => {
    expect(sumAmounts(['0.10', '0.20', null, '1'])).toBe('1.30');
    expect(sumQuantities(['0.1', '0.2', '1.700'])).toBe('2');
  });
});
