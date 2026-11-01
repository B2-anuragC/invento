// Recording a payment received or paid against a saved bill, from its View panel.
// Self-contained: the tests load this module on its own.

type Value = string | number | null | undefined;
export type PaymentBill = {
  status?: string;
  documentNumber?: string | null;
  saleDate?: string;
  purchaseDate?: string;
  paymentMethod?: string;
  total?: Value;
  returnedTotal?: Value;
  netTotal?: Value;
  amountPaid?: Value;
  payments?: { method?: string; kind?: string; paidAt?: string }[];
};

export const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];
const amountPattern = /^\d{1,12}(?:\.\d{1,2})?$/;
const paise = (value: Value) => Math.round(Number(value ?? 0) * 100);
const rupees = (value: number) => (value / 100).toFixed(2);
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
/** The calendar day in India, "2026-11-01". */
export const indiaDay = (value: Date | string) => new Date(new Date(value).getTime() + 19_800_000).toISOString().slice(0, 10);

/** The bill's amount after returns, in paise. Refunds already lowered `amountPaid`. */
const netPaise = (bill: PaymentBill) => (bill.netTotal != null ? paise(bill.netTotal) : paise(bill.total) - paise(bill.returnedTotal));

/**
 * Whether a payment can be recorded: a completed bill whose prices the member
 * can see, with money still owed or an older bill whose earlier payments were
 * never recorded.
 */
export function canRecordPayment(bill: PaymentBill): boolean {
  if (bill.status !== "COMPLETED" || bill.total == null) return false;
  // Nothing can be owed once returns brought the bill to zero.
  const net = netPaise(bill);
  return net > 0 && (bill.amountPaid == null || net - paise(bill.amountPaid) > 0);
}

/** The form's starting values: what is owed, the allowed days and the method last used. */
export function paymentStart(kind: "sale" | "purchase", bill: PaymentBill, now = new Date()) {
  const net = netPaise(bill);
  const balance = bill.amountPaid == null ? null : Math.max(0, net - paise(bill.amountPaid));
  const lastPayment = [...(bill.payments ?? [])].reverse().find((payment) => payment.kind === "PAYMENT");
  const billDay = kind === "sale" ? bill.saleDate : bill.purchaseDate;
  return {
    net,
    balance,
    amount: balance == null ? "" : rupees(balance),
    method: lastPayment?.method ?? (kind === "sale" && bill.paymentMethod ? bill.paymentMethod : "CASH"),
    paidOn: indiaDay(now),
    minDay: billDay ? indiaDay(billDay) : undefined,
    maxDay: indiaDay(now),
  };
}

/** A past day is recorded at noon in India; today keeps the current time. */
export function paidAtFor(day: string, now = new Date()): string {
  return day === indiaDay(now) ? now.toISOString() : `${day}T12:00:00+05:30`;
}

export type PaymentEntry = { amount: string; opening: string; method: string; paidOn: string };

/**
 * Checks the form and builds the request body, or explains what to fix. An
 * older bill first needs what was paid before this payment ("0" when nothing).
 */
export function paymentRequest(
  kind: "sale" | "purchase",
  bill: PaymentBill,
  entry: PaymentEntry,
  requestId: string,
  now = new Date(),
): { error: string } | { body: Record<string, string>; amount: number } {
  const start = paymentStart(kind, bill, now);
  const amount = entry.amount.trim();
  const opening = entry.opening.trim();
  const historical = bill.amountPaid == null;
  if (historical && !amountPattern.test(opening)) return { error: "Enter how much was paid before this payment (0 if nothing)." };
  if (historical && paise(opening) > start.net) return { error: `Paid before this payment cannot be more than the bill's ${money(start.net)}.` };
  if (!amountPattern.test(amount) || paise(amount) <= 0) return { error: "Enter a payment amount greater than zero, with up to two decimals." };
  const owed = historical ? start.net - paise(opening) : start.balance ?? 0;
  if (paise(amount) > owed) return { error: owed > 0 ? `The payment cannot be more than the ${money(owed)} still owed.` : "Nothing is owed on this bill." };
  if (!PAYMENT_METHODS.includes(entry.method)) return { error: "Choose how it was paid." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.paidOn)) return { error: `Enter the date it was ${kind === "sale" ? "received" : "paid"}.` };
  if (start.minDay && entry.paidOn < start.minDay) return { error: "The payment date cannot be before the bill date." };
  if (entry.paidOn > start.maxDay) return { error: "The payment date cannot be in the future." };
  return {
    amount: paise(amount),
    body: {
      amount: rupees(paise(amount)),
      method: entry.method,
      requestId,
      paidAt: paidAtFor(entry.paidOn, now),
      ...(historical ? { openingAmountPaid: rupees(paise(opening)) } : {}),
    },
  };
}

/** "Payment of ₹500.00 recorded for INV/2026-27/0003." */
export function paymentRecordedMessage(kind: "sale" | "purchase", bill: PaymentBill, amount: number): string {
  return `${kind === "sale" ? "Payment" : "Payment to supplier"} of ${money(amount)} recorded${bill.documentNumber ? ` for ${bill.documentNumber}` : ""}.`;
}
