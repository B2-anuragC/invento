// Customer/supplier and balance columns, and the "View" panels for bills and people.
// Self-contained: the tests load this module on its own.

type Value = string | number | null | undefined;
export type BillKind = "sale" | "purchase";
export type DetailBill = {
  id: string;
  status?: string;
  documentNumber?: string | null;
  invoiceNumber?: string | null;
  saleDate?: string;
  purchaseDate?: string;
  dueDate?: string | null;
  paymentMethod?: string;
  chargeGst?: boolean;
  taxType?: string | null;
  buyerGstin?: string | null;
  subtotal?: Value;
  discountTotal?: Value;
  taxTotal?: Value;
  total?: Value;
  returnedTotal?: Value;
  netTotal?: Value;
  amountPaid?: Value;
  note?: string | null;
  cancelReason?: string | null;
  customerId?: string;
  supplierId?: string;
  customer?: { id?: string; name?: string; phone?: string | null; gstin?: string | null; address?: string | null } | null;
  supplier?: { id?: string; name?: string; phone?: string | null; gstin?: string | null; address?: string | null } | null;
  payments?: { id?: string; amount?: Value; method?: string; kind?: string; paidAt?: string }[];
  items?: {
    id?: string;
    quantity?: Value;
    unit?: string | null;
    optionName?: string | null;
    sellingPrice?: Value;
    purchasePrice?: Value;
    gstRate?: Value;
    taxAmount?: Value;
    lineTotal?: Value;
    returnedQuantity?: Value;
    product?: { name?: string; sku?: string; unit?: string } | null;
  }[];
};

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const paise = (value: Value) => Math.round(Number(value ?? 0) * 100);
const money = (value: number) => rupees.format(value / 100);
const day = (value: Value) => {
  const time = value == null ? NaN : new Date(String(value)).getTime();
  return Number.isNaN(time) ? "—" : dayFormat.format(time);
};
/** The calendar day in India, "2026-11-01", for comparing with a due date. */
export const indiaToday = (now = new Date()) => new Date(now.getTime() + 19_800_000).toISOString().slice(0, 10);
const methodNames: Record<string, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };
export const methodName = (method: Value) => (method == null ? "—" : methodNames[String(method)] ?? String(method).replaceAll("_", " ").toLowerCase());
const unitName = (value: Value) => String(value ?? "").replaceAll("_", " ").toLowerCase();
const quantityText = (value: Value) => String(Number(Number(value ?? 0).toFixed(3)));

export const partyOf = (kind: BillKind, bill: DetailBill) => (kind === "sale" ? bill.customer : bill.supplier);
export const billDate = (kind: BillKind, bill: DetailBill) => (kind === "sale" ? bill.saleDate : bill.purchaseDate);

/** The bill's amount after returns, in paise; null when prices are hidden. */
function netPaise(bill: DetailBill): number | null {
  if (bill.total == null) return null;
  return bill.netTotal != null ? paise(bill.netTotal) : paise(bill.total) - paise(bill.returnedTotal);
}

/**
 * What is still owed on a bill, in paise. Null when it cannot be known: a
 * cancelled bill (its payments were refunded), hidden prices, or an older bill
 * saved before payments were recorded.
 */
export function balanceDue(bill: DetailBill): number | null {
  const net = netPaise(bill);
  if (bill.status === "CANCELLED" || net == null || bill.amountPaid == null) return null;
  return Math.max(0, net - paise(bill.amountPaid));
}

/** The Balance column: "Paid", "₹500.00 due", "₹500.00 overdue" past the due date, or "—". */
export function balanceText(bill: DetailBill, today = indiaToday()): string {
  const due = balanceDue(bill);
  if (due == null) return "—";
  if (due === 0) return "Paid";
  const overdue = !!bill.dueDate && bill.dueDate.slice(0, 10) < today;
  return `${money(due)} ${overdue ? "overdue" : "due"}`;
}

/** The bills table's row with the customer or supplier and the balance. */
export function billRow<T extends DetailBill>(kind: BillKind, bill: T, today = indiaToday()) {
  return { ...bill, party: partyOf(kind, bill)?.name ?? "—", balance: balanceText(bill, today) };
}

export type PartyBalance = { bills: number; billed: number; due: number; overdue: number };

/**
 * Totals per customer or supplier from their bills: how many, the amount
 * billed after returns and what is still owed (cancelled bills are left out).
 */
export function partyBalances(kind: BillKind, bills: DetailBill[], today = indiaToday()): Map<string, PartyBalance> {
  const totals = new Map<string, PartyBalance>();
  for (const bill of bills) {
    const id = (kind === "sale" ? bill.customerId ?? bill.customer?.id : bill.supplierId ?? bill.supplier?.id) ?? "";
    if (!id || bill.status === "CANCELLED") continue;
    const entry = totals.get(id) ?? { bills: 0, billed: 0, due: 0, overdue: 0 };
    const due = balanceDue(bill) ?? 0;
    entry.bills += 1;
    entry.billed += netPaise(bill) ?? 0;
    entry.due += due;
    if (due > 0 && bill.dueDate && bill.dueDate.slice(0, 10) < today) entry.overdue += due;
    totals.set(id, entry);
  }
  return totals;
}

/** The people table's Balance column: "₹1,200.00 due", "Nothing due" or "—" with no bills. */
export function partyBalanceText(balance: PartyBalance | undefined): string {
  if (!balance) return "—";
  if (balance.due === 0) return "Nothing due";
  return balance.overdue > 0 ? `${money(balance.due)} due (${money(balance.overdue)} overdue)` : `${money(balance.due)} due`;
}

export type DetailLine = { label: string; value: string };

/** The amounts block of a bill's details, with only the lines that apply. */
export function billAmounts(bill: DetailBill, today = indiaToday()): DetailLine[] {
  if (bill.total == null) return [{ label: "Amounts", value: "Hidden for your role" }];
  const lines: DetailLine[] = [{ label: "Subtotal", value: money(paise(bill.subtotal)) }];
  if (paise(bill.discountTotal) > 0) lines.push({ label: "Discount", value: `− ${money(paise(bill.discountTotal))}` });
  lines.push({ label: "GST", value: bill.chargeGst === false ? "Not charged" : money(paise(bill.taxTotal)) });
  lines.push({ label: "Total", value: money(paise(bill.total)) });
  if (paise(bill.returnedTotal) > 0) {
    lines.push({ label: "Returns", value: `− ${money(paise(bill.returnedTotal))}` });
    lines.push({ label: "Net amount", value: money(netPaise(bill) ?? 0) });
  }
  if (bill.status !== "CANCELLED") {
    lines.push({ label: "Paid", value: bill.amountPaid == null ? "Not recorded" : money(paise(bill.amountPaid)) });
    lines.push({ label: "Balance", value: balanceText(bill, today) });
    if (bill.dueDate && (balanceDue(bill) ?? 0) > 0) lines.push({ label: "Due date", value: day(bill.dueDate) });
  }
  return lines;
}

/** The facts at the top of a bill's details. */
export function billFacts(kind: BillKind, bill: DetailBill): DetailLine[] {
  const party = partyOf(kind, bill);
  const lines: DetailLine[] = [
    { label: kind === "sale" ? "Invoice no." : "Purchase no.", value: bill.documentNumber || "—" },
    { label: "Date", value: day(billDate(kind, bill)) },
    { label: kind === "sale" ? "Customer" : "Supplier", value: party?.name ?? "—" },
  ];
  if (party?.phone) lines.push({ label: "Phone", value: party.phone });
  const gstin = kind === "sale" ? bill.buyerGstin ?? party?.gstin : party?.gstin;
  if (gstin) lines.push({ label: "GSTIN", value: gstin });
  if (bill.invoiceNumber) lines.push({ label: kind === "sale" ? "Reference" : "Supplier invoice", value: bill.invoiceNumber });
  if (kind === "sale" && bill.paymentMethod) lines.push({ label: "Payment method", value: methodName(bill.paymentMethod) });
  lines.push({ label: "Status", value: bill.status === "CANCELLED" ? "Cancelled" : "Completed" });
  if (bill.status === "CANCELLED" && bill.cancelReason) lines.push({ label: "Cancel reason", value: bill.cancelReason });
  if (bill.note) lines.push({ label: "Note", value: bill.note });
  return lines;
}

export type ItemRow = { id: string; name: string; quantity: string; price: string; gst: string; amount: string; returned: string };

/** The items table of a bill's details; prices read "—" when hidden. */
export function billItems(kind: BillKind, bill: DetailBill): ItemRow[] {
  return (bill.items ?? []).map((item, index) => {
    const price = kind === "sale" ? item.sellingPrice : item.purchasePrice;
    const unit = item.optionName ?? unitName(item.unit ?? item.product?.unit ?? "PIECE");
    return {
      id: String(item.id ?? index),
      name: item.product?.name ?? "Product unavailable",
      quantity: `${quantityText(item.quantity)} ${unit}`,
      price: price == null ? "—" : money(paise(price)),
      gst: item.gstRate == null ? "—" : `${quantityText(item.gstRate)}%${item.taxAmount != null && paise(item.taxAmount) > 0 ? ` · ${money(paise(item.taxAmount))}` : ""}`,
      amount: item.lineTotal == null ? "—" : money(paise(item.lineTotal)),
      returned: Number(item.returnedQuantity ?? 0) > 0 ? quantityText(item.returnedQuantity) : "—",
    };
  });
}

export type PaymentRow = { id: string; date: string; method: string; amount: string; kind: string };

/** Payments on a bill, oldest first; an opening balance is the amount paid before payments were recorded. */
export function billPayments(bill: DetailBill): PaymentRow[] {
  return [...(bill.payments ?? [])]
    .sort((a, b) => String(a.paidAt ?? "").localeCompare(String(b.paidAt ?? "")))
    .map((payment, index) => ({
      id: String(payment.id ?? index),
      date: day(payment.paidAt),
      method: methodName(payment.method),
      amount: payment.amount == null ? "—" : money(paise(payment.amount)),
      kind: payment.kind === "OPENING_BALANCE" ? "Paid earlier" : payment.kind === "REFUND" ? "Refund" : "Payment",
    }));
}

/** The summary line of a customer's or supplier's details. */
export function partySummary(kind: BillKind, balance: PartyBalance | undefined): string {
  if (!balance) return kind === "sale" ? "No sales to this customer yet." : "No purchases from this supplier yet.";
  const count = `${balance.bills} ${kind === "sale" ? "sale" : "purchase"}${balance.bills === 1 ? "" : "s"}`;
  return `${count} · ${money(balance.billed)} billed · ${partyBalanceText(balance)}`;
}
