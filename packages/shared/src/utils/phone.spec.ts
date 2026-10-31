import { describe, expect, it } from 'vitest';

import { isValidPhone } from './phone.js';

describe('isValidPhone', () => {
  it.each([
    '9876543210',
    '+919876543210',
    '+91 98765 43210',
    '098765-43210',
    '(022) 2345-6789',
    '022.2345.6789',
    '  9876543210  ',
    '1234567',
    '123456789012345',
  ])('accepts %s', (value) => {
    expect(isValidPhone(value)).toBe(true);
  });

  it.each([
    ['letters', 'abc12'],
    ['mixed letters', '98765abc10'],
    ['too few digits', '123456'],
    ['too many digits', '1234567890123456'],
    ['plus not at the start', '91+9876543210'],
    ['two plus signs', '++919876543210'],
    ['only punctuation', '+() - .'],
    ['other symbols', '98765#43210'],
    ['blank', '   '],
  ])('rejects %s', (_case, value) => {
    expect(isValidPhone(value)).toBe(false);
  });
});
