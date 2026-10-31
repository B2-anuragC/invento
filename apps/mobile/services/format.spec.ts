import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime, formatMoney, formatQuantity, plural, unitLabel } from './format';

describe('formatMoney', () => {
  it('always shows rupees with two decimals and Indian grouping', () => {
    expect(formatMoney(1124)).toBe('₹1,124.00');
    expect(formatMoney('2124')).toBe('₹2,124.00');
    expect(formatMoney(1234567.5)).toBe('₹12,34,567.50');
    expect(formatMoney(0.005)).toBe('₹0.01');
  });

  it('treats missing or invalid amounts as zero instead of NaN', () => {
    expect(formatMoney('')).toBe('₹0.00');
    expect(formatMoney('abc')).toBe('₹0.00');
    expect(formatMoney(undefined)).toBe('₹0.00');
    expect(formatMoney(null)).toBe('₹0.00');
  });
});

describe('formatDate', () => {
  it('reads timestamps and calendar dates the same way', () => {
    expect(formatDate('2026-10-31')).toBe('31 Oct 2026');
    expect(formatDate(new Date(2026, 9, 31, 10, 12))).toBe('31 Oct 2026');
  });

  it('keeps a plain date on its calendar day', () => {
    expect(formatDate('2026-11-01')).toBe('1 Nov 2026');
  });

  it('returns an empty string for invalid input', () => {
    expect(formatDate('not a date')).toBe('');
  });
});

describe('formatDateTime', () => {
  it('shows the date the same way as formatDate, followed by the time', () => {
    expect(formatDateTime(new Date(2026, 9, 31, 10, 12))).toBe('31 Oct 2026, 10:12 am');
    expect(formatDateTime(new Date(2026, 9, 31, 22, 5))).toBe('31 Oct 2026, 10:05 pm');
    expect(formatDateTime('nope')).toBe('');
  });
});

describe('plural', () => {
  it('agrees with the count', () => {
    expect(plural(0, 'product')).toBe('0 products');
    expect(plural(1, 'product')).toBe('1 product');
    expect(plural(2, 'item')).toBe('2 items');
    expect(plural(1, 'category', 'categories')).toBe('1 category');
    expect(plural(3, 'category', 'categories')).toBe('3 categories');
    expect(plural(1200, 'sale')).toBe('1,200 sales');
  });
});

describe('unitLabel and formatQuantity', () => {
  it('uses the singular for "per unit" labels', () => {
    expect(unitLabel('PIECE')).toBe('piece');
    expect(unitLabel('BOX')).toBe('box');
  });

  it('agrees with the quantity', () => {
    expect(formatQuantity(0, 'PIECE')).toBe('0 pieces');
    expect(formatQuantity(1, 'PIECE')).toBe('1 piece');
    expect(formatQuantity('200', 'PIECE')).toBe('200 pieces');
    expect(formatQuantity(2, 'BOX')).toBe('2 boxes');
    expect(formatQuantity(1.5, 'LITRE')).toBe('1.5 litres');
    expect(formatQuantity(3, 'PACK')).toBe('3 packs');
    expect(formatQuantity(-1, 'PIECE')).toBe('-1 piece');
    expect(formatQuantity(-20, 'PIECE')).toBe('-20 pieces');
  });

  it('keeps units that do not change in the plural', () => {
    expect(formatQuantity(142.5, 'SQUARE_FOOT')).toBe('142.5 sq ft');
    expect(formatQuantity(2, 'KG')).toBe('2 kg');
    expect(formatQuantity(12, 'DOZEN')).toBe('12 dozen');
    expect(formatQuantity(1.1234, 'METRE')).toBe('1.123 m');
  });

  it('falls back to a readable name for unknown units', () => {
    expect(unitLabel('RUNNING_METRE')).toBe('running metre');
  });
});
