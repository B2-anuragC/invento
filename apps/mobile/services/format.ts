// One place for how money, dates, counts and quantities read across the app.

const moneyFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const countFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** ₹1,124.00 — always two decimals and Indian digit grouping. */
export function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value);
  return moneyFormat.format(Number.isFinite(amount) ? amount : 0);
}

/** 31 Oct 2026. Accepts ISO timestamps and plain YYYY-MM-DD dates (read as that calendar day). */
export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

/** 31 Oct 2026, 10:12 am — for saved transactions and stock movements. */
export function formatDateTime(value: string | Date): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormat.format(date);
}

/** "1 item", "3 items", "1,200 products". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${countFormat.format(count)} ${count === 1 ? singular : pluralForm}`;
}

const unitNames: Record<string, [singular: string, plural: string]> = {
  PIECE: ['piece', 'pieces'],
  KG: ['kg', 'kg'],
  GRAM: ['g', 'g'],
  LITRE: ['litre', 'litres'],
  MILLILITRE: ['ml', 'ml'],
  METRE: ['m', 'm'],
  SQUARE_FOOT: ['sq ft', 'sq ft'],
  FOOT: ['feet', 'feet'],
  PACK: ['pack', 'packs'],
  BOX: ['box', 'boxes'],
  DOZEN: ['dozen', 'dozen'],
};

/**
 * Unit name for display. Without a quantity it is the singular "per unit" form
 * ("₹90.00 / piece"); with one it agrees with the number ("0 pieces", "1 piece").
 */
export function unitLabel(unit: string, quantity?: number): string {
  const names = unitNames[unit];
  if (!names) return unit.replaceAll('_', ' ').toLowerCase();
  return quantity === undefined || Math.abs(quantity) === 1 ? names[0] : names[1];
}

/** "200 pieces", "1 piece", "142.5 sq ft". */
export function formatQuantity(value: number | string, unit: string): string {
  const amount = Number(value);
  const quantity = Number.isFinite(amount) ? amount : 0;
  return `${countFormat.format(quantity)} ${unitLabel(unit, quantity)}`;
}
