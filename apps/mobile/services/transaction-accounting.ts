export const moneyValue = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function transactionTotals(items: { quantity: number; price: number; product: { gstRate?: string | number } }[]) {
  const subtotal = items.reduce((sum, item) => sum + moneyValue(item.quantity * item.price), 0);
  const tax = items.reduce((sum, item) => sum + moneyValue(moneyValue(item.quantity * item.price) * Number(item.product.gstRate ?? 0) / 100), 0);
  return { subtotal: moneyValue(subtotal), tax: moneyValue(tax), total: moneyValue(subtotal + tax) };
}
export const requestKey = () => `req_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
export const paymentBalance = (record: { total?: string | number | null; amountPaid?: string | number | null }) => record.total == null || record.amountPaid == null ? null : Math.max(0, moneyValue(Number(record.total) - Number(record.amountPaid)));
export function isOverdue(record: { total?: string | number | null; amountPaid?: string | number | null; dueDate?: string | null }) {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return Boolean((paymentBalance(record) ?? 0) > 0 && record.dueDate && record.dueDate.slice(0, 10) < date);
}
export const validDueDate = (value: string) => {
  if (!value) return true;
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
