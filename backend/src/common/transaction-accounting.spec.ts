import { Prisma } from '@prisma/client';
import { dueDateFor, paidAmount, taxFor } from './transaction-accounting.js';

describe('Transaction accounting', () => {
  it('rounds GST per line with half-up cents', () => {
    expect(taxFor(new Prisma.Decimal('0.25'), '18').taxAmount.toString()).toBe('0.05');
    expect(taxFor(new Prisma.Decimal('40'), '18').taxAmount.toString()).toBe('7.2');
    for (const invalid of ['-1', '100.01', '1.001']) expect(() => taxFor(new Prisma.Decimal(1), invalid)).toThrow();
  });
  it('distinguishes unknown historical payments from confirmed credit', () => {
    expect(paidAmount(undefined, new Prisma.Decimal(100))).toBeNull();
    expect(paidAmount('0', new Prisma.Decimal(100))?.toString()).toBe('0');
    for (const invalid of ['-1', '100.01', '1.001', 'NaN']) expect(() => paidAmount(invalid, new Prisma.Decimal(100))).toThrow();
  });
  it('rejects invalid calendar dates and dates before the transaction', () => {
    const date = new Date('2026-09-20T12:00:00Z');
    expect(dueDateFor('2026-09-20', date)?.toISOString()).toBe('2026-09-20T00:00:00.000Z');
    for (const invalid of ['2026-02-30', '2026-09-19', 'invalid']) expect(() => dueDateFor(invalid, date)).toThrow();
  });
});
