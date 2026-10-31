import { describe, expect, it } from 'vitest';

import { financialYearOf, formatDocumentNumber, isValidDocumentPrefix, normalizeDocumentPrefix } from './invoicing.js';

describe('financialYearOf', () => {
  it('starts the year on 1 April in India, not in UTC', () => {
    expect(financialYearOf('2026-03-31T18:29:59.999Z')).toBe('2025-26'); // 31 Mar 23:59:59 IST
    expect(financialYearOf('2026-03-31T18:30:00.000Z')).toBe('2026-27'); // 1 Apr 00:00 IST
  });

  it('ends the year on 31 March', () => {
    expect(financialYearOf('2027-03-31T18:29:59.000Z')).toBe('2026-27');
    expect(financialYearOf(new Date('2026-10-31T05:00:00Z'))).toBe('2026-27');
    expect(financialYearOf('2027-01-15T10:00:00Z')).toBe('2026-27');
  });

  it('formats the year across a century', () => {
    expect(financialYearOf('2099-06-01T00:00:00Z')).toBe('2099-00');
  });

  it('rejects an invalid date', () => {
    expect(() => financialYearOf('not a date')).toThrow(RangeError);
  });
});

describe('formatDocumentNumber', () => {
  it('pads the serial to four digits within the year', () => {
    expect(formatDocumentNumber('INV', '2026-27', 1)).toBe('INV/2026-27/0001');
    expect(formatDocumentNumber('PUR', '2026-27', 9999)).toBe('PUR/2026-27/9999');
    expect(formatDocumentNumber('A', '2026-27', 42)).toBe('A/2026-27/0042');
  });

  it('never exceeds 16 characters', () => {
    expect(formatDocumentNumber('INV', '2026-27', 1)).toHaveLength(16);
    expect(formatDocumentNumber('INV', '2026-27', 10000)).toBe('INV/26-27/10000');
    expect(formatDocumentNumber('AB', '2026-27', 10000)).toBe('AB/2026-27/10000');
    expect(formatDocumentNumber('INV', '2026-27', 999999)).toBe('INV/26-27/999999');
    expect(() => formatDocumentNumber('INV', '2026-27', 1234567)).toThrow('16 characters');
  });

  it('rejects a sequence that is not a positive whole number', () => {
    for (const sequence of [0, -1, 1.5, Number.NaN]) expect(() => formatDocumentNumber('INV', '2026-27', sequence)).toThrow(RangeError);
  });
});

describe('document prefix', () => {
  it('allows one to three letters or digits after normalising', () => {
    expect(normalizeDocumentPrefix(' inv ')).toBe('INV');
    for (const prefix of ['INV', 'PUR', 'A', 'S1', '2026'.slice(0, 3)]) expect(isValidDocumentPrefix(prefix)).toBe(true);
  });

  it('rejects empty, long, lowercase or punctuated prefixes', () => {
    for (const prefix of ['', 'INVO', 'inv', 'IN/', 'I-V', 'IN V']) expect(isValidDocumentPrefix(prefix)).toBe(false);
  });
});
