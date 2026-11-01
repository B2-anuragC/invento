import { billEditBlockReason, billEditSettlement, NOTHING_RETURNED, returnLineAmounts, returnQuantityError, returnSettlement, sumAmounts, sumQuantities, type DocumentSeries, type ReturnedSoFar } from '@invento/shared';

import type { CreatePurchaseInput, CreateSaleInput } from './api';
import { applyLocalMovement } from './local-stock';
import type { OfflineSnapshot } from './offline-model';
import { buildOfflineTransaction } from './offline-transactions';

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
export type LocalBill = { id: string; status?: string; revision?: number; editRequestId?: string | null; editedAt?: string | null; editReason?: string | null; cancelledAt?: string | null; cancelReason?: string | null; chargeGst?: boolean; customer?: { id: string; isWalkIn?: boolean }; supplier?: { id: string }; saleDate?: string; purchaseDate?: string;
  /** Stock the bill holds per product in ledger units, kept from its first edit on. */
  stockEffect?: Record<string, string>; total: string | number; amountPaid?: string | number | null; returnedTotal?: string | number; netTotal?: string | number; paymentMethod?: string | null; payments?: Payment[]; returns?: Note[]; items: Line[] };

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

/** Ledger units per product unit: pieces for grouped products. */
const ledgerSize = (snapshot: OfflineSnapshot, productId: string) => BigInt((snapshot.products.find((entry) => entry.id === productId) as { piecesPerUnit?: number | null } | undefined)?.piecesPerUnit ?? 1);
/** A device quantity (a number in the product's unit) in ledger thousandths. */
const ledgerThousandths = (snapshot: OfflineSnapshot, productId: string, quantity: number) => BigInt(Math.round(Math.abs(quantity) * 1000)) * ledgerSize(snapshot, productId);

/**
 * The stock a bill holds per product, in ledger thousandths (taken by a sale,
 * added by a purchase), as the server reads it from the bill's own movements.
 */
function heldStock(snapshot: OfflineSnapshot, kind: BillKind, bill: LocalBill): Map<string, bigint> {
  if (bill.stockEffect) return new Map(Object.entries(bill.stockEffect).map(([productId, value]) => [productId, thousandths(value)]));
  const held = new Map<string, bigint>();
  for (const entry of snapshot.inventoryActivity) {
    if (!entry.id.startsWith(`${bill.id}_`) || entry.type !== (kind === 'sale' ? 'SALE' : 'PURCHASE')) continue;
    const productId = entry.productId ?? entry.product.id;
    held.set(productId, (held.get(productId) ?? 0n) + ledgerThousandths(snapshot, productId, Number(entry.quantity)));
  }
  return held;
}

/** Moves the difference between the stock a bill holds and what it needs now, in product order. */
function moveStockDifference(snapshot: OfflineSnapshot, kind: BillKind, bill: LocalBill, next: Map<string, bigint>, context: LocalBillContext, note: (more: boolean) => string, short: (name: string) => string) {
  const current = heldStock(snapshot, kind, bill);
  for (const productId of [...new Set([...current.keys(), ...next.keys()])].sort((a, b) => a.localeCompare(b))) {
    const difference = (next.get(productId) ?? 0n) - (current.get(productId) ?? 0n);
    if (difference === 0n) continue;
    const more = difference > 0n;
    const grouped = ledgerSize(snapshot, productId) > 1n || !!(snapshot.products.find((entry) => entry.id === productId) as { piecesPerUnit?: number | null } | undefined)?.piecesPerUnit;
    try {
      applyLocalMovement(snapshot, { id: `${bill.id}_${context.newId()}`, productId, type: kind === 'sale' ? (more ? 'SALE' : 'RETURN_IN') : more ? 'PURCHASE' : 'RETURN_OUT', quantity: fromThousandths(more ? difference : -difference), unit: grouped ? 'PIECE' : undefined, note: note(more) }, context.now);
    } catch (error) {
      if (/Insufficient stock/.test((error as Error).message)) throw fail(short((snapshot.products.find((entry) => entry.id === productId) as { name?: string } | undefined)?.name ?? 'this item'), 409);
      throw error;
    }
  }
  bill.stockEffect = Object.fromEntries([...next].filter(([, value]) => value > 0n).map(([productId, value]) => [productId, fromThousandths(value)]));
}

// The builder names lines from a request id; edited lines are renamed, so any valid one will do.
const PRICING_REQUEST_ID = 'local_bill_edit';
const lastPaymentMethod = (bill: LocalBill) => [...(bill.payments ?? [])].reverse().find((payment) => payment.kind === 'PAYMENT')?.method ?? bill.paymentMethod ?? 'CASH';

/**
 * Edits the items of a completed bill on the device, as the server's
 * editItems and applyBillEdit do: the new lines are priced exactly as a new
 * bill's (products already on the bill may have been deactivated since),
 * stock moves by the difference, money paid above the new total is refunded,
 * and the revision goes up with when and why. The same requestId edits once.
 */
export function editLocalBill(snapshot: OfflineSnapshot, kind: BillKind, billId: string, input: { requestId: string; revision?: number; reason: string; chargeGst: boolean; discountAmount?: string; discountPercent?: string; expectedTotal?: string; expectedRefund?: string; refundMethod?: string; items: unknown[] }, context: LocalBillContext): LocalBill {
  const bill = findBill(snapshot, kind, billId);
  if (bill.editRequestId === input.requestId) return bill;
  const reason = input.reason?.trim();
  if (!reason) throw fail('Enter why this bill is edited.', 400);
  const blocked = billEditBlockReason({ status: bill.status ?? 'COMPLETED', returnedTotal: text(bill.returnedTotal), returnCount: bill.returns?.length ?? 0 });
  if (blocked) throw fail(blocked, 409);
  const revision = bill.revision ?? 1;
  if (input.revision !== undefined && input.revision !== revision) throw fail('This bill was changed while you were editing it. Reload it and try again.', 409);

  // Price the new lines as a new bill's, with the stock this bill holds put back and its own products and contact usable.
  const view: OfflineSnapshot = JSON.parse(JSON.stringify(snapshot));
  const held = heldStock(snapshot, kind, bill);
  for (const [productId, value] of held) {
    const stock = view.inventory.find((entry) => entry.productId === productId);
    const back = Number(value) / 1000 / Number(ledgerSize(snapshot, productId));
    if (stock && kind === 'sale') stock.quantity = Number(stock.quantity) + back;
  }
  const own = new Set(bill.items.map((line) => line.productId));
  for (const product of view.products) if (own.has(product.id)) product.status = 'ACTIVE';
  const contactId = kind === 'sale' ? bill.customer?.id : bill.supplier?.id;
  const contacts = kind === 'sale' ? view.customers : view.suppliers;
  for (const contact of contacts) if (contact.id === contactId) Object.assign(contact, { status: 'ACTIVE', isWalkIn: false });
  const date = (kind === 'sale' ? bill.saleDate : bill.purchaseDate) ?? context.now;
  const build = () => buildOfflineTransaction(view, kind, (kind === 'sale'
    ? { requestId: PRICING_REQUEST_ID, customerId: contactId, saleDate: date, chargeGst: input.chargeGst, discountAmount: input.discountAmount, discountPercent: input.discountPercent, items: input.items }
    : { requestId: PRICING_REQUEST_ID, supplierId: contactId, purchaseDate: date, chargeGst: input.chargeGst, items: input.items }) as unknown as CreateSaleInput | CreatePurchaseInput);
  let built: ReturnType<typeof build>;
  try {
    built = build();
  } catch (error) {
    // The builder checks stock with the bill's own stock put back, as the server checks the difference.
    const short = /^Insufficient stock for (.+) on this device\.$/.exec((error as Error).message);
    if (short) throw fail(`Not enough ${short[1]} in stock for this change.`, 409);
    throw error;
  }
  const total = text(built.record.total);
  if (input.expectedTotal !== undefined && thousandths(total) !== thousandths(input.expectedTotal)) throw fail('Prices changed while you were editing. Review the new total and save again.', 409);
  const amountPaid = bill.amountPaid === null || bill.amountPaid === undefined ? null : text(bill.amountPaid);
  if (kind === 'sale' && bill.customer?.isWalkIn && (amountPaid === null || thousandths(total) > thousandths(amountPaid))) throw fail('A walk-in sale must stay paid in full, so its total cannot go above what was paid. Make a new sale for the extra items.', 400);
  const settlement = billEditSettlement({ amountPaid, total });
  if (input.expectedRefund !== undefined && thousandths(settlement.refund) !== thousandths(input.expectedRefund)) throw fail('A payment was recorded on this bill while you were editing it. Reload it, check the refund and save again.', 409);

  const next = new Map<string, bigint>();
  for (const movement of built.movements) next.set(movement.productId, (next.get(movement.productId) ?? 0n) + ledgerThousandths(snapshot, movement.productId, movement.quantity));
  moveStockDifference(snapshot, kind, bill, next, context, (more) => (more ? `${kind === 'sale' ? 'Sale' : 'Purchase'} ${bill.id}` : `Edited ${kind} ${bill.id}`), (name) => (kind === 'sale' ? `Not enough ${name} in stock for this change.` : `Not enough ${name} in stock to take off this purchase: it has already been sold or used.`));

  const nextRevision = revision + 1;
  const record = built.record as unknown as Record<string, unknown> & { items: Line[] };
  const fields = ['subtotal', 'taxTotal', 'total', 'chargeGst', ...(kind === 'sale' ? ['discountTotal', 'discountPercent', 'taxType', 'sellerGstin', 'sellerStateCode', 'buyerGstin', 'placeOfSupply'] : [])];
  for (const field of fields) (bill as Record<string, unknown>)[field] = record[field];
  bill.items = record.items.map((line, index) => ({ ...line, id: `${bill.id}_r${nextRevision}_${index}` }));
  Object.assign(bill, { revision: nextRevision, editedAt: context.now, editReason: reason, editRequestId: input.requestId, netTotal: total });
  if (Number(settlement.refund) > 0) {
    bill.payments = [...(bill.payments ?? []), { id: `edit_${bill.id}_${nextRevision}`, amount: settlement.refund, method: input.refundMethod ?? lastPaymentMethod(bill), kind: 'REFUND', paidAt: context.now }];
    bill.amountPaid = settlement.amountPaid;
  }
  return bill;
}

/**
 * Cancels a completed bill on the device, as the server's cancelTransaction
 * does: the stock it holds goes back, money paid is refunded, and the bill
 * keeps its number. Cancelling a cancelled bill changes nothing.
 */
export function cancelLocalBill(snapshot: OfflineSnapshot, kind: BillKind, billId: string, input: { reason: string; refundMethod?: string }, context: LocalBillContext): LocalBill {
  const bill = findBill(snapshot, kind, billId);
  if (bill.status === 'CANCELLED') return bill;
  if (bill.status && bill.status !== 'COMPLETED') throw fail('Only a completed bill can be cancelled.', 409);
  if (bill.returns?.length) throw fail('This bill has returns, so it cannot be cancelled. Return the remaining items instead.', 409);
  const reason = input.reason?.trim();
  if (!reason) throw fail('Enter why this bill is cancelled.', 400);
  moveStockDifference(snapshot, kind, bill, new Map(), context, () => `Cancelled ${kind} ${bill.id}`, () => 'Stock from this purchase has already been sold or used, so the purchase cannot be cancelled.');
  const paid = bill.amountPaid === null || bill.amountPaid === undefined ? '0.00' : text(bill.amountPaid);
  if (Number(paid) > 0) {
    bill.payments = [...(bill.payments ?? []), { id: `refund_${bill.id}`, amount: sumAmounts([paid]), method: input.refundMethod ?? lastPaymentMethod(bill), kind: 'REFUND', paidAt: context.now }];
    bill.amountPaid = '0.00';
  }
  Object.assign(bill, { status: 'CANCELLED', cancelledAt: context.now, cancelReason: reason });
  return bill;
}
