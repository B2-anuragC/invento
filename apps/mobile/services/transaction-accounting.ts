import { discountAmountFor, discountError, lineGstRate, splitDiscount, type DiscountInput } from '@invento/shared';

export const moneyValue = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// Whole units of 10^-digits; anything not a usable number counts as zero while it is typed.
const scaled = (value: number, digits: number) => (Number.isFinite(value) && value > 0 ? BigInt(value.toFixed(digits).replace('.', '')) : 0n);
const decimal = (paise: bigint) => `${paise / 100n}.${String(paise % 100n).padStart(2, '0')}`;

/**
 * Bill preview computed exactly as the API does: each line rounded half-up to
 * the paisa, a sale's discount split across the lines before GST, and GST
 * rounded per line on what is left. A discount that cannot apply counts as none.
 * A bill that does not charge GST has no tax on any line; a missing choice
 * charges GST, as the API does.
 */
export function transactionTotals(items: { quantity: number; price: number; product: { gstRate?: string | number } }[], discount: DiscountInput = {}, chargeGst?: boolean) {
  const lines = items.map((item) => (scaled(item.quantity, 3) * scaled(item.price, 2) + 500n) / 1000n);
  const subtotal = lines.reduce((sum, line) => sum + line, 0n);
  const amount = discountError(decimal(subtotal), discount) ? '0.00' : discountAmountFor(decimal(subtotal), discount);
  const shares = splitDiscount(lines.map(decimal), amount).map((share) => scaled(Number(share), 2));
  const tax = lines.reduce((sum, line, index) => sum + ((line - shares[index]) * scaled(Number(lineGstRate(items[index].product.gstRate, chargeGst)), 2) + 5000n) / 10000n, 0n);
  const discountTotal = scaled(Number(amount), 2);
  return { subtotal: Number(decimal(subtotal)), discount: Number(decimal(discountTotal)), tax: Number(decimal(tax)), total: Number(decimal(subtotal - discountTotal + tax)) };
}
/** The discount a sale screen sends for what was typed; an unfinished "10." counts as 10. */
export function saleDiscountInput(mode: 'amount' | 'percent', value: string): { discountAmount?: string; discountPercent?: string } {
  const text = value.replace(/\.$/, '');
  if (!text) return {};
  return mode === 'percent' ? { discountPercent: text } : { discountAmount: text };
}
export const requestKey = () => `req_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
/** What is still owed; none for a cancelled bill, whose payments were refunded. */
export const paymentBalance = (record: { total?: string | number | null; amountPaid?: string | number | null; status?: string }) => record.status === 'CANCELLED' || record.total == null || record.amountPaid == null ? null : Math.max(0, moneyValue(Number(record.total) - Number(record.amountPaid)));
export function isOverdue(record: { total?: string | number | null; amountPaid?: string | number | null; dueDate?: string | null; status?: string }) {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return Boolean((paymentBalance(record) ?? 0) > 0 && record.dueDate && record.dueDate.slice(0, 10) < date);
}
export const validDueDate = (value: string) => {
  if (!value) return true;
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
