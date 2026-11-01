// Table values in plain form: rupees, India dates and quantities without trailing zeros.
// Self-contained: the tests load this module on its own.

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const amount = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const utcFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

const numeric = (value: unknown) =>
  (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim()));
const time = (value: unknown) => {
  if (value == null || value === "") return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** "₹1,23,456.50"; "—" when there is no amount (hidden or not recorded). */
export function money(value: unknown): string {
  return numeric(value) ? rupees.format(Number(value)) : "—";
}
/** "12.5", "1,200": up to three decimals, as quantities are stored. */
export function quantity(value: unknown): string {
  return numeric(value) ? amount.format(Number(value)) : "—";
}
/** The calendar day in India, "1 Nov 2026"; a plain "2026-11-01" is that day. */
export function indiaDate(value: unknown): string {
  const parsed = time(value);
  return parsed ? dayFormat.format(parsed) : "—";
}
/** A moment in India time, "1 Nov 2026, 3:05 pm". */
export function indiaDateTime(value: unknown): string {
  const parsed = time(value);
  return parsed ? timeFormat.format(parsed) : "—";
}
/** A moment in UTC for platform pages, whose ranges are in UTC: "1 Nov 2026, 09:35 UTC". */
export function utcDateTime(value: unknown): string {
  const parsed = time(value);
  return parsed ? `${utcFormat.format(parsed)} UTC` : "Not recorded";
}
/** "PACK" → "pack", "SQUARE_FOOT" → "square foot". */
export function unitName(value: unknown): string {
  return value == null || value === "" ? "—" : String(value).replaceAll("_", " ").toLowerCase();
}
/** "ACTIVE" → "Active", "BANK_TRANSFER" → "Bank transfer". */
export function codeName(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value).replaceAll("_", " ").toLowerCase().replace(/^./, (first) => first.toUpperCase()).replace(/\bupi\b/i, "UPI");
}

const moneyKeys = new Set(["purchasePrice", "sellingPrice", "costPrice", "price", "total", "subtotal", "taxTotal", "discountTotal", "amountPaid", "netTotal", "returnedTotal", "lineTotal", "taxAmount", "amount", "todaySales", "todayPurchases", "balanceDue", "billed"]);
const dayKeys = new Set(["saleDate", "purchaseDate", "returnDate", "dueDate", "paidAt"]);
const momentKeys = new Set(["createdAt", "updatedAt", "editedAt", "cancelledAt"]);
const quantityKeys = new Set(["quantity", "balanceAfter", "minimumStock", "stock"]);
const codeKeys = new Set(["status", "paymentMethod", "method", "role"]);

/**
 * How a column's value reads in a table, chosen by the column. Text that was
 * already formatted (e.g. "₹100.00" or "Paid") is kept as it is.
 */
export function formatCell(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (moneyKeys.has(key)) return numeric(value) ? money(value) : String(value);
  if (dayKeys.has(key)) return time(value) ? indiaDate(value) : String(value);
  if (momentKeys.has(key)) return time(value) ? indiaDateTime(value) : String(value);
  if (quantityKeys.has(key)) return numeric(value) ? quantity(value) : String(value);
  if (key === "gstRate") return numeric(value) ? `${quantity(value)}%` : String(value);
  if (key === "unit") return unitName(value);
  if (codeKeys.has(key) && /^[A-Z_]+$/.test(String(value))) return codeName(value);
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
