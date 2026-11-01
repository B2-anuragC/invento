import { describe, expect, it } from 'vitest';
import { indiaDate, todayBillTotals } from './dashboard-summary';

describe('Offline dashboard totals', () => {
  it('uses the India date', () => {
    expect(indiaDate('2026-10-31T19:00:00.000Z')).toBe('2026-11-01');
    expect(indiaDate('2026-10-31T18:00:00.000Z')).toBe('2026-10-31');
  });

  it("counts today's completed bills net of returns", () => {
    const bills = [
      { saleDate: '2026-11-01T04:00:00.000Z', total: '236', returnedTotal: '118', netTotal: '118', status: 'COMPLETED' },
      { saleDate: '2026-11-01T05:00:00.000Z', total: '100.1', returnedTotal: '0', status: 'COMPLETED' },
      { saleDate: '2026-11-01T06:00:00.000Z', total: '500', status: 'CANCELLED' },
      { saleDate: '2026-10-30T06:00:00.000Z', total: '70', status: 'COMPLETED' },
    ];
    expect(todayBillTotals(bills, (bill) => bill.saleDate, '2026-11-01')).toEqual({ count: 2, total: 218.1 });
    expect(todayBillTotals([{ purchaseDate: '2026-11-01T04:00:00.000Z', total: null }], (bill) => bill.purchaseDate, '2026-11-01')).toEqual({ count: 1, total: 0 });
  });
});
