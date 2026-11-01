import { NOTHING_RETURNED, returnLineAmounts, returnQuantityError, returnSettlement, returnableQuantity, sumAmounts, sumQuantities, type ReturnedSoFar } from '@invento/shared';

import { formatMoney } from './format';
import { paymentMethodLabel } from './payment-methods';
import { netAmount } from './transaction-accounting';

// Returns of saved bills: a credit note takes goods back from a customer, a
// debit note sends goods back to a supplier. The bill itself never changes;
// these helpers work out what is left to return, preview a return with the
// same shared arithmetic the API uses, and describe returns in lists.

type Value = string | number | null | undefined;
export type ReturnKind = 'sale' | 'purchase';
export type ReturnNoteLine = { saleItemId?: string; purchaseItemId?: string; quantity: Value; lineTotal?: Value; discountAmount?: Value; taxAmount?: Value };
export type ReturnNote = { id: string; documentNumber: string; returnDate: string; total?: Value; refundAmount?: Value; refundMethod?: string | null; reason?: string | null; items: ReturnNoteLine[] };
export type ReturnBillLine = { id: string; name: string; quantity: Value; lineTotal?: Value; discountAmount?: Value; taxAmount?: Value; returnedQuantity?: Value };
export type ReturnBill = { id: string; kind: ReturnKind; status?: string; syncState?: string; total?: Value; netTotal?: Value; returnedTotal?: Value; amountPaid?: Value; returns?: ReturnNote[]; items: ReturnBillLine[] };

/** A typed or sent quantity as a plain decimal with up to three places ("2", "0.5"). */
export const quantityText = (value: Value) => String(Number(Number(value ?? 0).toFixed(3)));
const amountText = (value: Value) => Number(value ?? 0).toFixed(2);

export const noteName = (kind: ReturnKind) => (kind === 'sale' ? 'credit note' : 'debit note');

/** What earlier returns took back from each line, from the bill's notes (or only the quantity when the notes are not there). */
export function returnedByLine(bill: Pick<ReturnBill, 'kind' | 'returns' | 'items'>): Map<string, ReturnedSoFar> {
  const byLine = new Map<string, ReturnNoteLine[]>();
  for (const note of bill.returns ?? []) for (const item of note.items) {
    const lineId = (bill.kind === 'sale' ? item.saleItemId : item.purchaseItemId) ?? '';
    byLine.set(lineId, [...(byLine.get(lineId) ?? []), item]);
  }
  return new Map(bill.items.map((line) => {
    const items = byLine.get(line.id) ?? [];
    if (!items.length) return [line.id, Number(line.returnedQuantity ?? 0) > 0 ? { ...NOTHING_RETURNED, quantity: quantityText(line.returnedQuantity) } : NOTHING_RETURNED];
    return [line.id, {
      quantity: sumQuantities(items.map((item) => quantityText(item.quantity))),
      lineTotal: sumAmounts(items.map((item) => amountText(item.lineTotal))),
      discountAmount: sumAmounts(items.map((item) => amountText(item.discountAmount))),
      taxAmount: sumAmounts(items.map((item) => amountText(item.taxAmount))),
    }];
  }));
}

/** Each line with what was sold or bought, what came back and what can still be returned. */
export function returnableLines(bill: Pick<ReturnBill, 'kind' | 'returns' | 'items'>) {
  const returned = returnedByLine(bill);
  return bill.items.map((line) => {
    const sold = quantityText(line.quantity);
    const back = returned.get(line.id)?.quantity ?? '0';
    return { id: line.id, name: line.name, sold, returned: back, left: returnableQuantity(sold, back) };
  });
}

/** Whether "Return items" is offered: a saved, completed bill with something left, for a role that may return. */
export function canReturnBill(bill: ReturnBill, mayReturn: boolean): boolean {
  if (!mayReturn || bill.syncState || bill.id.startsWith('local_') || (bill.status && bill.status !== 'COMPLETED')) return false;
  return returnableLines(bill).some((line) => Number(line.left) > 0);
}

export type ReturnPreview = {
  lines: { id: string; quantity: string; error: string; total: string | null }[];
  /** What the API is sent; empty until a valid quantity is typed. */
  items: { itemId: string; quantity: string }[];
  /** Value of the return; null when prices are hidden. */
  total: string | null;
  balanceReduction: string | null;
  refund: string | null;
  error: string;
};

/**
 * Previews a return of the typed quantities (blank means none of that line):
 * each line's amounts, the note's total, and how it is settled (first off what
 * is still owed, the rest refunded), exactly as the API will record it.
 */
export function returnPreview(bill: ReturnBill, typed: Record<string, string>): ReturnPreview {
  const returned = returnedByLine(bill);
  const priced = bill.total != null && bill.items.every((line) => line.lineTotal != null);
  const lines: ReturnPreview['lines'] = [];
  for (const line of bill.items) {
    const text = (typed[line.id] ?? '').trim().replace(/\.$/, '');
    if (!text) continue;
    const before = returned.get(line.id) ?? NOTHING_RETURNED;
    const error = returnQuantityError(quantityText(line.quantity), before.quantity, text);
    const total = error || !priced ? null : returnLineAmounts({ quantity: quantityText(line.quantity), lineTotal: amountText(line.lineTotal), discountAmount: amountText(line.discountAmount), taxAmount: amountText(line.taxAmount) }, before, text).total;
    lines.push({ id: line.id, quantity: text, error, total });
  }
  const invalid = lines.find((line) => line.error);
  const error = !lines.length ? 'Enter a quantity for at least one item.' : invalid ? `${bill.items.find((line) => line.id === invalid.id)?.name ?? 'Item'}: ${invalid.error}` : '';
  if (error) return { lines, items: [], total: null, balanceReduction: null, refund: null, error };
  const total = priced ? sumAmounts(lines.map((line) => line.total)) : null;
  const settlement = total == null ? null : returnSettlement({ netTotal: amountText(netAmount(bill)), amountPaid: bill.amountPaid == null ? null : amountText(bill.amountPaid), returnTotal: total });
  return { lines, items: lines.map((line) => ({ itemId: line.id, quantity: line.quantity })), total, balanceReduction: settlement?.balanceReduction ?? null, refund: settlement?.refund ?? null, error: '' };
}

/** "Returned ₹212.40 · CN/2026-27/0001" for lists; empty when nothing came back. */
export function returnSummary(bill: Pick<ReturnBill, 'returnedTotal' | 'returns'>): string {
  const notes = bill.returns ?? [];
  if (!notes.length && !(Number(bill.returnedTotal ?? 0) > 0)) return '';
  const numbers = notes.length === 1 ? notes[0].documentNumber : notes.length > 1 ? `${notes.length} notes` : '';
  const amount = bill.returnedTotal != null && Number(bill.returnedTotal) > 0 ? `Returned ${formatMoney(Number(bill.returnedTotal))}` : 'Returned';
  return [amount, numbers].filter(Boolean).join(' · ');
}

/** How a note's value was settled: "Refunded ₹100.00 · Cash and ₹112.40 off the balance". */
export function noteSettlement(kind: ReturnKind, note: Pick<ReturnNote, 'total' | 'refundAmount' | 'refundMethod'>): string {
  if (note.total == null) return '';
  const refund = Number(note.refundAmount ?? 0);
  const reduced = Math.round((Number(note.total) - refund) * 100) / 100;
  const parts = [
    ...(refund > 0 ? [`${kind === 'sale' ? 'Refunded' : 'Refund received'} ${formatMoney(refund)} · ${paymentMethodLabel(note.refundMethod ?? 'CASH')}`] : []),
    ...(reduced > 0 ? [`${formatMoney(reduced)} off the ${kind === 'sale' ? 'amount due' : 'amount owed'}`] : []),
  ];
  return parts.join(' and ');
}
