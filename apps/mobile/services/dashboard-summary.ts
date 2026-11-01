import { formatMoney, formatQuantity, plural } from './format';
import { countedAmount, moneyValue } from './transaction-accounting';

/** The India (UTC+5:30) calendar date of a moment, e.g. "2026-11-01". */
export const indiaDate = (value: string | number | Date) => new Date(new Date(value).getTime() + 19800000).toISOString().slice(0, 10);

type DatedBill = { total?: string | number | null; netTotal?: string | number | null; returnedTotal?: string | number | null; status?: string };

/**
 * Today's bills on the device copy, like the server's summary: completed bills
 * only, each counted at its amount after returns (credit or debit notes).
 */
export function todayBillTotals<T extends DatedBill>(bills: T[], dateOf: (bill: T) => string, today: string): { count: number; total: number } {
  const counted = bills.filter((bill) => indiaDate(dateOf(bill)) === today && bill.status !== 'CANCELLED');
  return { count: counted.length, total: moneyValue(counted.reduce((sum, bill) => sum + countedAmount(bill), 0)) };
}

/** How many days the Overview's top products cover, ending today (the server's default range). */
export const topProductDays = 30;

/** The first India date of a range of `days` days ending on `today` ("2026-11-01" → "2026-10-03" for 30). */
export const rangeStart = (today: string, days: number) => new Date(new Date(`${today}T00:00:00.000Z`).getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);

export type LowStockRow = { productId: string; name: string; sku: string; unit: string; quantity: string | number; minimumStock: string | number };
type StockProduct = { id: string; name: string; sku: string; unit: string; minimumStock: string | number; status: string; piecesPerUnit?: number | null };

/**
 * Active products below their minimum stock on the device copy, like the
 * server's low-stock list: stock never recorded counts as zero, ordered by name.
 * Quantities are in the product's own unit, as the inventory list gives them.
 */
export function lowStockRows(products: StockProduct[], inventory: { productId: string; quantity: string | number }[], limit: number): LowStockRow[] {
  const stock = new Map(inventory.map((row) => [row.productId, Number(row.quantity)]));
  return products
    .filter((product) => product.status === 'ACTIVE' && (stock.get(product.id) ?? 0) < Number(product.minimumStock))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .slice(0, limit)
    .map((product) => ({ productId: product.id, name: product.name, sku: product.sku, unit: product.unit, quantity: stock.get(product.id) ?? 0, minimumStock: product.minimumStock }));
}

export type TopProductRow = { productId: string; name: string; sku: string; unit: string; quantity: string | number; revenue: string | number };
type SoldLine = { productId: string; unit?: string | null; unitsPerOption?: string | number; quantity: string | number; lineTotal?: string | number; discountAmount?: string | number; returnedQuantity?: string | number; product?: { name: string; sku: string; unit: string } };
type SoldBill = { saleDate: string; status?: string; items: SoldLine[] };

/**
 * Products ranked by sales revenue between two India dates on the device copy,
 * like the server: completed sales only, each line after its share of the bill
 * discount and net of what was returned (returns reverse a line in proportion),
 * quantities in the product's own unit. Ties go to the product id.
 */
export function topProductRows(sales: SoldBill[], products: StockProduct[], from: string, to: string, limit: number): TopProductRow[] {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const totals = new Map<string, TopProductRow & { quantity: number; revenue: number }>();
  for (const sale of sales) {
    const date = indiaDate(sale.saleDate);
    if (sale.status === 'CANCELLED' || date < from || date > to) continue;
    for (const line of sale.items) {
      const product = productsById.get(line.productId);
      const sold = Number(line.quantity);
      const kept = sold - Number(line.returnedQuantity ?? 0);
      if (!(sold > 0)) continue;
      const inUnits = kept * Number(line.unitsPerOption ?? 1) / (line.unit === 'PIECE' ? product?.piecesPerUnit ?? 1 : 1);
      const revenue = (Number(line.lineTotal ?? 0) - Number(line.discountAmount ?? 0)) * kept / sold;
      const row = totals.get(line.productId) ?? { productId: line.productId, name: product?.name ?? line.product?.name ?? 'Product', sku: product?.sku ?? line.product?.sku ?? '', unit: product?.unit ?? line.product?.unit ?? 'PIECE', quantity: 0, revenue: 0 };
      row.quantity += inUnits;
      row.revenue += revenue;
      totals.set(line.productId, row);
    }
  }
  return [...totals.values()]
    .filter((row) => row.quantity > 0)
    .map((row) => ({ ...row, quantity: Math.round(row.quantity * 1000) / 1000, revenue: moneyValue(row.revenue) }))
    .sort((left, right) => right.revenue - left.revenue || (left.productId < right.productId ? -1 : left.productId > right.productId ? 1 : 0))
    .slice(0, limit);
}

/** "3 pieces left · min 10", or "Out of stock · min 10" at zero. */
export function lowStockText(row: Pick<LowStockRow, 'quantity' | 'minimumStock' | 'unit'>): string {
  const quantity = Number(row.quantity);
  return `${quantity > 0 ? `${formatQuantity(quantity, row.unit)} left` : 'Out of stock'} · min ${formatQuantity(Number(row.minimumStock), row.unit)}`;
}

/**
 * Today's purchases line on the Overview: the amount when the member can see
 * purchase prices (the server sends null otherwise), and always the count.
 */
export function purchasesSummary(summary: { todayPurchases: string | number | null; purchaseCount: number }): { value: string; detail: string } {
  const count = plural(summary.purchaseCount, 'purchase');
  return summary.todayPurchases == null ? { value: count, detail: 'Amounts hidden for your role' } : { value: formatMoney(summary.todayPurchases), detail: count };
}
