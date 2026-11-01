import { describe, expect, it } from 'vitest';
import { indiaDate, lowStockRows, lowStockText, purchasesSummary, rangeStart, todayBillTotals, topProductRows } from './dashboard-summary';

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

  it('starts a 30-day range 29 days before today', () => {
    expect(rangeStart('2026-11-01', 30)).toBe('2026-10-03');
    expect(rangeStart('2026-03-01', 1)).toBe('2026-03-01');
  });
});

const product = (id: string, name: string, minimumStock: string, extra: Record<string, unknown> = {}) => ({ id, name, sku: id.toUpperCase(), unit: 'PIECE', minimumStock, status: 'ACTIVE', ...extra });

describe('Overview low stock', () => {
  it('lists active products below their minimum by name, counting unrecorded stock as zero', () => {
    const products = [product('c', 'Clamp', '10'), product('a', 'Anchor', '5'), product('b', 'Bolt', '5'), product('d', 'Drill', '5', { status: 'INACTIVE' }), product('e', 'Epoxy', '0')];
    const inventory = [{ productId: 'c', quantity: '3' }, { productId: 'b', quantity: '5' }, { productId: 'd', quantity: '0' }];
    expect(lowStockRows(products, inventory, 5)).toEqual([
      { productId: 'a', name: 'Anchor', sku: 'A', unit: 'PIECE', quantity: 0, minimumStock: '5' },
      { productId: 'c', name: 'Clamp', sku: 'C', unit: 'PIECE', quantity: 3, minimumStock: '10' },
    ]);
    expect(lowStockRows(products, inventory, 1)).toHaveLength(1);
  });

  it('says how much is left or that it is out', () => {
    expect(lowStockText({ quantity: '3', minimumStock: '10', unit: 'PIECE' })).toBe('3 pieces left · min 10 pieces');
    expect(lowStockText({ quantity: 0, minimumStock: '1.5', unit: 'DOZEN' })).toBe('Out of stock · min 1.5 dozen');
  });
});

describe('Overview top products', () => {
  const products = [product('glass', 'Float Glass', '0', { unit: 'SQUARE_FOOT' }), product('handle', 'Door Handle', '0', { unit: 'DOZEN', piecesPerUnit: 12 })];
  const line = (productId: string, quantity: string, lineTotal: string, extra: Record<string, unknown> = {}) => ({ productId, quantity, lineTotal, discountAmount: '0', ...extra });

  it('ranks by revenue after discount and returns, in the product unit, within the dates', () => {
    const sales = [
      { saleDate: '2026-10-31T05:00:00.000Z', status: 'COMPLETED', items: [line('glass', '10', '1000', { discountAmount: '100', returnedQuantity: '2' }), line('handle', '6', '600', { unit: 'PIECE' })] },
      { saleDate: '2026-11-01T05:00:00.000Z', items: [line('handle', '2', '1200', { unit: 'PACK', unitsPerOption: '10', sellingOptionId: 'pack' })] },
      { saleDate: '2026-11-01T06:00:00.000Z', status: 'CANCELLED', items: [line('glass', '100', '9000')] },
      { saleDate: '2026-10-01T06:00:00.000Z', status: 'COMPLETED', items: [line('glass', '100', '9000')] },
    ];
    expect(topProductRows(sales, products, '2026-10-03', '2026-11-01', 5)).toEqual([
      { productId: 'handle', name: 'Door Handle', sku: 'HANDLE', unit: 'DOZEN', quantity: 20.5, revenue: 1800 },
      { productId: 'glass', name: 'Float Glass', sku: 'GLASS', unit: 'SQUARE_FOOT', quantity: 8, revenue: 720 },
    ]);
    expect(topProductRows(sales, products, '2026-10-03', '2026-11-01', 1).map((row) => row.productId)).toEqual(['handle']);
  });

  it('leaves out lines returned in full and uses the bill copy for products no longer listed', () => {
    const sales = [{ saleDate: '2026-11-01T05:00:00.000Z', status: 'COMPLETED', items: [line('glass', '4', '400', { returnedQuantity: '4' }), line('old', '1', '50', { product: { name: 'Old Hinge', sku: 'OLD', unit: 'PIECE' } })] }];
    expect(topProductRows(sales, products, '2026-11-01', '2026-11-01', 5)).toEqual([{ productId: 'old', name: 'Old Hinge', sku: 'OLD', unit: 'PIECE', quantity: 1, revenue: 50 }]);
  });
});

describe('Overview purchases', () => {
  it('shows the amount only to members who can see purchase prices', () => {
    expect(purchasesSummary({ todayPurchases: '2360', purchaseCount: 2 })).toEqual({ value: '₹2,360.00', detail: '2 purchases' });
    expect(purchasesSummary({ todayPurchases: null, purchaseCount: 1 })).toEqual({ value: '1 purchase', detail: 'Amounts hidden for your role' });
  });
});
