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
