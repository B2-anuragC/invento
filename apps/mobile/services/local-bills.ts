import { NOTHING_RETURNED, returnLineAmounts, returnQuantityError, returnSettlement, sumAmounts, sumQuantities, type DocumentSeries, type ReturnedSoFar } from '@invento/shared';

import { applyLocalMovement } from './local-stock';
import type { OfflineSnapshot } from './offline-model';

// Returns, item edits and cancellations of bills in a shop kept only on this
// device. They follow the server's rules and messages (apps/api/src/common:
// returns.ts, bill-edits.ts, cancellation.ts) and use the same shared
// arithmetic, so a guest shop uploaded later gets the same amounts and numbers.

export type BillKind = 'sale' | 'purchase';
export type AllocatedNumber = { documentNumber: string; financialYear: string; documentSeq: number };
/** Device context: the time, new ids, and the next number in a series for a date. */
export type LocalBillContext = { now: string; newId: () => string; allocate: (series: DocumentSeries, date: string) => AllocatedNumber };

const fail = (message: string, status: number) => Object.assign(new Error(message), { status });

type Line = { id: string; productId: string; quantity: string | number; lineTotal?: string | number; discountAmount?: string | number; taxAmount?: string | number; gstRate?: string | number; unit?: string | null; sellingOptionId?: string | null; stockQuantity?: string | null; returnedQuantity?: string | number; product?: { name?: string; unit?: string } };
type NoteLine = { id: string; saleItemId?: string; purchaseItemId?: string; productId: string; quantity: string; stockQuantity?: string; lineTotal: string; discountAmount?: string; gstRate: string; taxAmount: string };
type Note = { id: string; requestId: string; documentNumber: string; financialYear: string; documentSeq: number; returnDate: string; subtotal: string; discountTotal?: string; taxTotal: string; total: string; refundAmount: string; refundMethod: string | null; reason: string | null; items: NoteLine[] };
type Payment = { id: string; amount: string | number; method: string; kind: string; paidAt: string };
export type LocalBill = { id: string; status?: string; total: string | number; amountPaid?: string | number | null; returnedTotal?: string | number; netTotal?: string | number; paymentMethod?: string | null; payments?: Payment[]; returns?: Note[]; items: Line[] };

const text = (value: string | number | null | undefined, fallback = '0') => (value === null || value === undefined || value === '' ? fallback : String(value));
const thousandths = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0').slice(0, 3));
};
const fromThousandths = (value: bigint) => `${value / 1000n}.${String(value % 1000n).padStart(3, '0')}`;
const quantityText = (value: string | number) => (typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : value);

/** The bill's records, for the bill's kind. */
export function localBills(snapshot: OfflineSnapshot, kind: BillKind): LocalBill[] {
  return (kind === 'sale' ? snapshot.sales : snapshot.purchases) as unknown as LocalBill[];
}

function findBill(snapshot: OfflineSnapshot, kind: BillKind, id: string) {
  const bill = localBills(snapshot, kind).find((record) => record.id === id);
  if (!bill) throw fail(kind === 'sale' ? 'Sale not found.' : 'Purchase not found.', 404);
  return bill;
}

function product(snapshot: OfflineSnapshot, line: Line) {
  const record = snapshot.products.find((entry) => entry.id === line.productId) as { name?: string; unit?: string; piecesPerUnit?: number | null } | undefined;
  return { name: record?.name ?? line.product?.name ?? 'This item', unit: record?.unit ?? line.product?.unit ?? 'PIECE', piecesPerUnit: record?.piecesPerUnit ?? null };
}

/**
 * The stock a line moved, in the server's ledger units (pieces for grouped
 * products). Bills saved before lines kept it are worked out when the line was
 * sold in the product's own unit; otherwise it is not known.
 */
function lineStock(kind: BillKind, line: Line, item: { unit: string; piecesPerUnit: number | null }): string | null {
  const size = BigInt(item.piecesPerUnit ?? 1);
  if (kind === 'purchase') return fromThousandths(thousandths(quantityText(line.quantity)) * size);
  if (line.stockQuantity) return line.stockQuantity;
  if (line.sellingOptionId) return null;
  if (!line.unit || line.unit === item.unit) return fromThousandths(thousandths(quantityText(line.quantity)) * size);
  if (line.unit === 'PIECE' && item.piecesPerUnit) return quantityText(line.quantity);
  return null;
}

/** What earlier returns took back from each line. */
function returnedSoFar(bill: LocalBill, kind: BillKind): Map<string, ReturnedSoFar> {
  const sums = new Map<string, NoteLine[]>();
  for (const note of bill.returns ?? []) for (const item of note.items) {
    const lineId = (kind === 'sale' ? item.saleItemId : item.purchaseItemId) ?? '';
    sums.set(lineId, [...(sums.get(lineId) ?? []), item]);
  }
  return new Map(bill.items.map((line) => {
    const items = sums.get(line.id) ?? [];
    return [line.id, items.length ? {
      quantity: sumQuantities(items.map((item) => item.quantity)),
      lineTotal: sumAmounts(items.map((item) => item.lineTotal)),
      discountAmount: sumAmounts(items.map((item) => item.discountAmount ?? '0')),
      taxAmount: sumAmounts(items.map((item) => item.taxAmount)),
    } : NOTHING_RETURNED];
  }));
}

/**
 * Records a sales return (credit note) or purchase return (debit note) on the
 * device, as the server's recordReturn does: lines checked against what is
 * left, amounts reversed with the shared arithmetic, the note numbered CN/… or
 * DN/…, stock moved back, and the value first reducing what is owed with the
 * rest refunded. A retried request (same requestId) changes nothing.
 */
export function recordLocalReturn(snapshot: OfflineSnapshot, kind: BillKind, billId: string, input: { requestId: string; items: { itemId: string; quantity: string }[]; reason?: string; refundMethod?: string }, context: LocalBillContext): LocalBill {
  const bill = findBill(snapshot, kind, billId);
  for (const record of localBills(snapshot, kind)) {
    if (record.returns?.some((note) => note.requestId === input.requestId)) {
      if (record.id !== billId) throw fail('This return request has already been used.', 409);
      return bill;
    }
  }
  if (bill.status === 'CANCELLED') throw fail('A cancelled bill cannot be returned.', 409);
  if (bill.status && bill.status !== 'COMPLETED') throw fail('Only a completed bill can be returned.', 409);
  if (!input.items?.length) throw fail('Choose at least one item to return.', 400);

  const returned = returnedSoFar(bill, kind);
  const byId = new Map(bill.items.map((line) => [line.id, line]));
  const seen = new Set<string>();
  const planned = input.items.map(({ itemId, quantity }) => {
    const line = byId.get(itemId);
    if (!line) throw fail('A returned item is not on this bill.', 400);
    if (seen.has(itemId)) throw fail('Each item can appear only once in a return.', 400);
    seen.add(itemId);
    const item = product(snapshot, line);
    const sold = quantityText(line.quantity);
    const before = returned.get(line.id) ?? NOTHING_RETURNED;
    const problem = returnQuantityError(sold, before.quantity, quantity);
    if (problem) throw fail(`${item.name}: ${problem}`, 400);
    const stockText = lineStock(kind, line, item);
    if (stockText === null) throw fail(`${item.name} on this older bill cannot be returned here. Adjust its stock in Inventory instead.`, 409);

    // The running share of the line's stock for everything returned so far, less what earlier returns put back.
    const soldQ = thousandths(sold);
    const stock = thousandths(stockText);
    const running = (value: bigint) => (value === soldQ ? stock : (stock * value) / soldQ);
    const exact = (value: bigint) => value === soldQ || (stock * value) % soldQ === 0n;
    const earlier = thousandths(before.quantity);
    const after = earlier + thousandths(quantity);
    const wholePieces = item.piecesPerUnit != null || item.unit === 'PIECE';
    if (!exact(after) || !exact(earlier) || (wholePieces && running(after) % 1000n !== 0n)) {
      throw fail(wholePieces ? `${item.name} must be returned in whole pieces.` : `${item.name}: this quantity cannot be returned exactly. Return whole selling units.`, 400);
    }
    const stockQuantity = running(after) - running(earlier);
    if (stockQuantity <= 0n) throw fail(`${item.name}: this quantity is too small to return.`, 400);
    const amounts = returnLineAmounts({ quantity: sold, lineTotal: text(line.lineTotal), discountAmount: text(line.discountAmount), taxAmount: text(line.taxAmount) }, before, quantity);
    return { line, item, quantity, stockQuantity: fromThousandths(stockQuantity), ...amounts };
  });
  const subtotal = sumAmounts(planned.map((entry) => entry.lineTotal));
  const discountTotal = sumAmounts(planned.map((entry) => entry.discountAmount));
  const taxTotal = sumAmounts(planned.map((entry) => entry.taxAmount));
  const total = sumAmounts([subtotal, `-${discountTotal}`, taxTotal]);

  const returnedTotal = text(bill.returnedTotal, '0.00');
  const amountPaid = bill.amountPaid === null || bill.amountPaid === undefined ? null : text(bill.amountPaid);
  const settlement = returnSettlement({ netTotal: sumAmounts([text(bill.total), `-${returnedTotal}`]), amountPaid, returnTotal: total });
  const refunded = Number(settlement.refund) > 0;
  const lastPayment = [...(bill.payments ?? [])].reverse().find((payment) => payment.kind === 'PAYMENT');
  const refundMethod = refunded ? input.refundMethod ?? lastPayment?.method ?? bill.paymentMethod ?? 'CASH' : null;

  const number = context.allocate(kind === 'sale' ? 'CREDIT_NOTE' : 'DEBIT_NOTE', context.now);
  const noteId = context.newId();
  // Stock first: a purchase return whose goods are gone changes nothing.
  for (const entry of [...planned].sort((a, b) => a.line.productId.localeCompare(b.line.productId))) {
    try {
      applyLocalMovement(snapshot, { id: `${noteId}_${entry.line.productId}`, productId: entry.line.productId, type: kind === 'sale' ? 'RETURN_IN' : 'RETURN_OUT', quantity: entry.stockQuantity, unit: entry.item.piecesPerUnit ? 'PIECE' : undefined, note: `${kind === 'sale' ? 'Credit note' : 'Debit note'} ${number.documentNumber}` }, context.now);
    } catch (error) {
      if (kind === 'purchase' && /Insufficient stock/.test((error as Error).message)) throw fail(`Not enough ${entry.item.name} in stock to return: it has already been sold or used.`, 409);
      throw error;
    }
  }

  const note: Note = {
    id: noteId,
    requestId: input.requestId,
    ...number,
    returnDate: context.now,
    subtotal,
    ...(kind === 'sale' ? { discountTotal } : {}),
    taxTotal,
    total,
    refundAmount: settlement.refund,
    refundMethod,
    reason: input.reason?.trim() || null,
    items: planned.map((entry) => ({
      id: context.newId(),
      ...(kind === 'sale' ? { saleItemId: entry.line.id, stockQuantity: entry.stockQuantity, discountAmount: entry.discountAmount } : { purchaseItemId: entry.line.id }),
      productId: entry.line.productId,
      quantity: entry.quantity,
      lineTotal: entry.lineTotal,
      gstRate: text(entry.line.gstRate),
      taxAmount: entry.taxAmount,
    })),
  };
  bill.returns = [...(bill.returns ?? []), note];
  bill.returnedTotal = sumAmounts([returnedTotal, total]);
  bill.netTotal = sumAmounts([text(bill.total), `-${bill.returnedTotal}`]);
  for (const entry of planned) entry.line.returnedQuantity = sumQuantities([quantityText(entry.line.returnedQuantity ?? '0'), entry.quantity]);
  if (refunded) {
    bill.payments = [...(bill.payments ?? []), { id: `return_${noteId}`, amount: settlement.refund, method: refundMethod!, kind: 'REFUND', paidAt: context.now }];
    if (amountPaid !== null) bill.amountPaid = sumAmounts([amountPaid, `-${settlement.refund}`]);
  }
  return bill;
}
