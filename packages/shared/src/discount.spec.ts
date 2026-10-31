import { describe, expect, it } from 'vitest';

import { DISCOUNT_AMOUNT_RULE_MESSAGE, DISCOUNT_PERCENT_RULE_MESSAGE, discountAmountFor, discountError, splitDiscount } from './discount.js';

const paise = (values: string[]) => values.reduce((sum, value) => sum + Math.round(Number(value) * 100), 0);

describe('discountError', () => {
  it('accepts no discount, an amount up to the subtotal, or a percentage up to 100', () => {
    for (const input of [{}, { discountAmount: '' }, { discountAmount: '0' }, { discountAmount: '250.5' }, { discountAmount: '1000.00' }, { discountPercent: '12.5' }, { discountPercent: '100' }, { discountAmount: null, discountPercent: '0' }]) {
      expect(discountError('1000.00', input)).toBe('');
    }
  });

  it('explains what is wrong', () => {
    expect(discountError('1000.00', { discountAmount: '1000.01' })).toBe(DISCOUNT_AMOUNT_RULE_MESSAGE);
    expect(discountError('1000.00', { discountAmount: '-5' })).toBe(DISCOUNT_AMOUNT_RULE_MESSAGE);
    expect(discountError('1000.00', { discountAmount: '10.555' })).toBe(DISCOUNT_AMOUNT_RULE_MESSAGE);
    expect(discountError('1000.00', { discountPercent: '100.01' })).toBe(DISCOUNT_PERCENT_RULE_MESSAGE);
    expect(discountError('1000.00', { discountPercent: '5.125' })).toBe(DISCOUNT_PERCENT_RULE_MESSAGE);
    expect(discountError('1000.00', { discountAmount: '10', discountPercent: '5' })).toMatch(/not both/);
  });
});

describe('discountAmountFor', () => {
  it('uses the amount entered or rounds the percentage half-up to the paisa', () => {
    expect(discountAmountFor('1000.00', { discountAmount: '250.5' })).toBe('250.50');
    expect(discountAmountFor('999.99', { discountPercent: '10' })).toBe('100.00'); // 99.999
    expect(discountAmountFor('0.05', { discountPercent: '10' })).toBe('0.01'); // 0.005
    expect(discountAmountFor('333.33', { discountPercent: '33.33' })).toBe('111.10'); // 111.098889
    expect(discountAmountFor('1000.00', {})).toBe('0.00');
  });
});

describe('splitDiscount', () => {
  it('splits in proportion to line amounts', () => {
    expect(splitDiscount(['1800.00', '180.00', '20.00'], '200.00')).toEqual(['180.00', '18.00', '2.00']);
  });

  it('gives leftover paise to the largest remainders, earlier lines first', () => {
    expect(splitDiscount(['1.00', '1.00', '1.00'], '0.10')).toEqual(['0.04', '0.03', '0.03']);
    expect(splitDiscount(['10.00', '20.00'], '0.01')).toEqual(['0.00', '0.01']);
  });

  it('always adds up to the discount and never exceeds a line', () => {
    const cases: Array<[string[], string]> = [
      [['0.01', '999999.99', '0.50'], '1000000.50'],
      [['33.33', '33.33', '33.34'], '7.77'],
      [['0.03', '0.03', '0.03', '0.01'], '0.09'],
      [['123456789012.34', '0.01'], '61728394506.17'],
    ];
    for (const [lines, discount] of cases) {
      const shares = splitDiscount(lines, discount);
      expect(paise(shares)).toBe(paise([discount]));
      shares.forEach((share, index) => expect(Number(share)).toBeLessThanOrEqual(Number(lines[index])));
    }
  });

  it('gives no discount when there is nothing to split', () => {
    expect(splitDiscount(['10.00', '5.00'], '0')).toEqual(['0.00', '0.00']);
    expect(splitDiscount([], '5.00')).toEqual([]);
  });
});
