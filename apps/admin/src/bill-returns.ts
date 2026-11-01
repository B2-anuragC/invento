import {
  NOTHING_RETURNED,
  returnLineAmounts,
  returnQuantityError,
  returnSettlement,
  returnableQuantity,
  sumAmounts,
  sumQuantities,
  type ReturnedSoFar,
} from "@invento/shared";

// Returns of saved bills from the admin Sales and Purchases sections: a credit
// note takes goods back from a customer, a debit note sends goods back to a
// supplier. The bill never changes; these helpers work out what is left to
// return, preview a return with the same shared arithmetic the API uses, and
// list the notes.

type Value = string | number | null | undefined;
export type ReturnKind = "sale" | "purchase";
export type NoteLine = { saleItemId?: string; purchaseItemId?: string; quantity: Value; lineTotal?: Value; discountAmount?: Value; taxAmount?: Value };
export type Note = { id: string; documentNumber: string; returnDate: string; total?: Value; refundAmount?: Value; refundMethod?: string | null; reason?: string | null; items?: NoteLine[] };
export type BillLine = { id: string; quantity: Value; unit?: string | null; optionName?: string | null; product?: { name?: string; unit?: string } | null; lineTotal?: Value; discountAmount?: Value; taxAmount?: Value; returnedQuantity?: Value };
export type Bill = {
  id: string;
  documentNumber?: string | null;
  status?: string;
  total?: Value;
  netTotal?: Value;
  returnedTotal?: Value;
  amountPaid?: Value;
  paymentMethod?: string | null;
  payments?: { method?: string; kind?: string }[];
  customer?: { name?: string } | null;
  supplier?: { name?: string } | null;
  returns?: Note[];
  items?: BillLine[];
};

// The note's calendar date in India (as istDateInput in transaction-edit.ts; tests load this module on its own).
const istDate = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? "" : new Date(time + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
};
const quantityText = (value: Value) => String(Number(Number(value ?? 0).toFixed(3)));
const amountText = (value: Value) => Number(value ?? 0).toFixed(2);
export const money = (value: Value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value ?? 0));
export const noteName = (kind: ReturnKind) => (kind === "sale" ? "Credit note" : "Debit note");
const methodLabels: Record<string, string> = { CASH: "cash", UPI: "UPI", CARD: "card", BANK_TRANSFER: "bank transfer", OTHER: "other" };
const methodLabel = (method: string) => methodLabels[method] ?? method.replaceAll("_", " ").toLowerCase();

/** What is still payable on the bill after its returns. */
const netAmount = (bill: Bill) =>
  bill.netTotal != null ? Number(bill.netTotal) : Number(bill.total ?? 0) - Number(bill.returnedTotal ?? 0);

/** How the bill was paid, the default refund method (as when cancelling). */
export function billPaymentMethod(bill: Bill): string {
  const last = [...(bill.payments ?? [])].reverse().find((payment) => payment.kind === "PAYMENT")?.method;
  return last ?? bill.paymentMethod ?? "CASH";
}

/** What earlier returns took back from each line, from the bill's notes (or only the quantity when they are not loaded). */
export function returnedByLine(kind: ReturnKind, bill: Bill): Map<string, ReturnedSoFar> {
  const byLine = new Map<string, NoteLine[]>();
  for (const note of bill.returns ?? [])
    for (const item of note.items ?? []) {
      const lineId = (kind === "sale" ? item.saleItemId : item.purchaseItemId) ?? "";
      byLine.set(lineId, [...(byLine.get(lineId) ?? []), item]);
    }
  return new Map(
    (bill.items ?? []).map((line) => {
      const items = byLine.get(line.id) ?? [];
      if (!items.length)
        return [line.id, Number(line.returnedQuantity ?? 0) > 0 ? { ...NOTHING_RETURNED, quantity: quantityText(line.returnedQuantity) } : NOTHING_RETURNED];
      return [
        line.id,
        {
          quantity: sumQuantities(items.map((item) => quantityText(item.quantity))),
          lineTotal: sumAmounts(items.map((item) => amountText(item.lineTotal))),
          discountAmount: sumAmounts(items.map((item) => amountText(item.discountAmount))),
          taxAmount: sumAmounts(items.map((item) => amountText(item.taxAmount))),
        },
      ];
    }),
  );
}

const plurals: Record<string, string> = { PIECE: "pieces", PACK: "packs", BOX: "boxes" };
/** "2 pieces", "1 piece", "2.5 kg": the unit after a quantity. */
const unitText = (unit: string | null | undefined, quantity: string) =>
  unit ? (quantity !== "1" && plurals[unit]) || unit.replaceAll("_", " ").toLowerCase() : "";

/** The line's name as printed: the product, with the pack it was sold in. */
export const lineName = (line: BillLine) =>
  [line.product?.name ?? "Item", line.optionName].filter(Boolean).join(" · ");

/** Each line with what was sold or bought, what came back and what can still be returned. */
export function returnableLines(kind: ReturnKind, bill: Bill) {
  const returned = returnedByLine(kind, bill);
  return (bill.items ?? []).map((line) => {
    const sold = quantityText(line.quantity);
    const back = returned.get(line.id)?.quantity ?? "0";
    return { id: line.id, name: lineName(line), unit: line.optionName ? "" : unitText(line.unit ?? line.product?.unit, sold), sold, returned: back, left: returnableQuantity(sold, back) };
  });
}

/** Whether "Return items" is offered: a completed bill with something left, for a role that may return. */
export function canReturnBill(kind: ReturnKind, bill: Bill, mayReturn: boolean): boolean {
  if (!mayReturn || bill.status !== "COMPLETED") return false;
  return returnableLines(kind, bill).some((line) => Number(line.left) > 0);
}

/** A bill with returns cannot be cancelled (the API refuses it). */
export const hasReturns = (bill: Bill) => (bill.returns?.length ?? 0) > 0 || Number(bill.returnedTotal ?? 0) > 0;

export type ReturnPreview = {
  lines: { id: string; quantity: string; error: string; total: string | null }[];
  /** What the API is sent; empty until every typed quantity is valid. */
  items: { itemId: string; quantity: string }[];
  /** Value of the note; null when prices are hidden. */
  total: string | null;
  balanceReduction: string | null;
  refund: string | null;
  error: string;
};

/**
 * Previews a return of the typed quantities (blank means none of that line):
 * each line's value, the note's total, and how it is settled (first off what
 * is still owed, the rest refunded), exactly as the API will record it.
 */
export function returnPreview(kind: ReturnKind, bill: Bill, typed: Record<string, string>): ReturnPreview {
  const returned = returnedByLine(kind, bill);
  const items = bill.items ?? [];
  const priced = bill.total != null && items.every((line) => line.lineTotal != null);
  const lines: ReturnPreview["lines"] = [];
  for (const line of items) {
    const text = (typed[line.id] ?? "").trim().replace(/\.$/, "");
    if (!text) continue;
    const before = returned.get(line.id) ?? NOTHING_RETURNED;
    const error = returnQuantityError(quantityText(line.quantity), before.quantity, text);
    const total =
      error || !priced
        ? null
        : returnLineAmounts({ quantity: quantityText(line.quantity), lineTotal: amountText(line.lineTotal), discountAmount: amountText(line.discountAmount), taxAmount: amountText(line.taxAmount) }, before, text).total;
    lines.push({ id: line.id, quantity: text, error, total });
  }
  const invalid = lines.find((line) => line.error);
  const error = !lines.length
    ? "Enter a quantity for at least one item."
    : invalid
      ? `${lineName(items.find((line) => line.id === invalid.id) ?? { id: "", quantity: 0 })}: ${invalid.error}`
      : "";
  if (error) return { lines, items: [], total: null, balanceReduction: null, refund: null, error };
  const total = priced ? sumAmounts(lines.map((line) => line.total)) : null;
  const settlement =
    total == null
      ? null
      : returnSettlement({ netTotal: amountText(netAmount(bill)), amountPaid: bill.amountPaid == null ? null : amountText(bill.amountPaid), returnTotal: total });
  return { lines, items: lines.map((line) => ({ itemId: line.id, quantity: line.quantity })), total, balanceReduction: settlement?.balanceReduction ?? null, refund: settlement?.refund ?? null, error: "" };
}

/** How a note's value was settled: "Refunded ₹100.00 by UPI and ₹260.00 off the amount due". */
export function noteSettlement(kind: ReturnKind, note: Pick<Note, "total" | "refundAmount" | "refundMethod">): string {
  if (note.total == null) return "";
  const refund = Number(note.refundAmount ?? 0);
  const reduced = Math.round((Number(note.total) - refund) * 100) / 100;
  return [
    ...(refund > 0 ? [`${kind === "sale" ? "Refunded" : "Refund received"} ${money(refund)} by ${methodLabel(note.refundMethod ?? "CASH")}`] : []),
    ...(reduced > 0 ? [`${money(reduced)} off the ${kind === "sale" ? "amount due" : "amount owed"}`] : []),
  ].join(" and ");
}

/** The Returns column of the bills table: "₹212.40 · CN/2026-27/0001"; empty when nothing came back. */
export function returnSummary(bill: Bill): string {
  if (!hasReturns(bill)) return "";
  const numbers = (bill.returns ?? []).map((note) => note.documentNumber).join(", ");
  return [bill.returnedTotal != null ? money(bill.returnedTotal) : "", numbers].filter(Boolean).join(" · ") || "Returned";
}

export type NoteRow = { id: string; documentNumber: string; returnDate: string; billNumber: string; party: string; total: string; settlement: string; reason: string };

/** Every credit or debit note of the listed bills, newest first, for the notes table. */
export function noteRows(kind: ReturnKind, bills: Bill[]): NoteRow[] {
  return bills
    .flatMap((bill) =>
      (bill.returns ?? []).map((note) => ({
        id: note.id,
        documentNumber: note.documentNumber,
        returnDate: istDate(note.returnDate),
        sortKey: note.returnDate,
        billNumber: String(bill.documentNumber ?? "—"),
        party: String((kind === "sale" ? bill.customer?.name : bill.supplier?.name) ?? "—"),
        total: note.total != null ? money(note.total) : "—",
        settlement: noteSettlement(kind, note) || "—",
        reason: note.reason ?? "—",
      })),
    )
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey) || b.documentNumber.localeCompare(a.documentNumber))
    .map(({ sortKey: _sortKey, ...row }) => row);
}
