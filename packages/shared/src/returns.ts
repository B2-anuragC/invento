// Sales returns (credit notes) and purchase returns (debit notes). A return
// takes back part or all of a bill line; the line's amount, its share of the
// bill discount and its GST are reversed in proportion to the quantity. The
// API works the amounts out with these functions and the apps preview them
// with the same ones, so a credit note always matches what was shown.
// Amounts are decimal strings with up to two places and quantities with up to
// three; the arithmetic is in whole paise and thousandths.

export const CREDIT_NOTE_PREFIX = 'CN';
export const DEBIT_NOTE_PREFIX = 'DN';

/** A bill line as sold or bought. Purchases have no discount. */
export type ReturnableLine = { quantity: string; lineTotal: string; discountAmount?: string | null; taxAmount: string };
/** What earlier returns already took back from the line (sums of their return lines). */
export type ReturnedSoFar = { quantity: string; lineTotal: string; discountAmount?: string | null; taxAmount: string };
export type ReturnLineAmounts = { lineTotal: string; discountAmount: string; taxAmount: string; total: string };

const QUANTITY = /^\d{1,9}(?:\.\d{1,3})?$/;
export const NOTHING_RETURNED: ReturnedSoFar = { quantity: '0', lineTotal: '0', discountAmount: '0', taxAmount: '0' };

const scaled = (value: string, places: number): bigint => {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const result = BigInt(whole || '0') * 10n ** BigInt(places) + BigInt(fraction.slice(0, places).padEnd(places, '0') || '0');
  return negative ? -result : result;
};
const unscaled = (value: bigint, places: number, trim = false): string => {
  const sign = value < 0n ? '-' : '';
  const magnitude = value < 0n ? -value : value;
  const unit = 10n ** BigInt(places);
  let fraction = String(magnitude % unit).padStart(places, '0');
  if (trim) fraction = fraction.replace(/0+$/, '');
  return `${sign}${magnitude / unit}${fraction ? `.${fraction}` : ''}`;
};
const paise = (value: string | null | undefined) => scaled(value ?? '0', 2);
const thousandths = (value: string) => scaled(value, 3);
const rupees = (value: bigint) => unscaled(value, 2);

/** How much of the line can still be returned, e.g. "1.5". */
export function returnableQuantity(sold: string, returned: string): string {
  const left = thousandths(sold) - thousandths(returned);
  return unscaled(left > 0n ? left : 0n, 3, true);
}

/** Why this quantity cannot be returned from the line, or '' when it can. */
export function returnQuantityError(sold: string, returned: string, quantity: string): string {
  if (!QUANTITY.test(quantity) || thousandths(quantity) <= 0n) return 'Enter a return quantity greater than zero, with up to three decimals.';
  const left = returnableQuantity(sold, returned);
  if (thousandths(quantity) > thousandths(left)) return thousandths(left) === 0n ? 'This item has already been returned in full.' : `Only ${left} can be returned.`;
  return '';
}

/**
 * The amounts this return takes back from a line. The running share of each
 * amount (line total, discount, GST) for everything returned so far is
 * rounded half-up to the paisa, and this return gets the difference from what
 * earlier returns took. Returning the rest of a line therefore takes back
 * exactly what is left, and all returns of a line never add up to more than it.
 */
export function returnLineAmounts(line: ReturnableLine, returned: ReturnedSoFar, quantity: string): ReturnLineAmounts {
  const sold = thousandths(line.quantity);
  const after = thousandths(returned.quantity) + thousandths(quantity);
  if (sold <= 0n || after > sold) throw new RangeError('Return quantity exceeds the quantity left on the line.');
  const share = (amount: string | null | undefined, before: string | null | undefined) => {
    const whole = paise(amount);
    const running = after === sold ? whole : (whole * after * 2n + sold) / (sold * 2n);
    return running - paise(before);
  };
  const lineTotal = share(line.lineTotal, returned.lineTotal);
  const discountAmount = share(line.discountAmount, returned.discountAmount);
  const taxAmount = share(line.taxAmount, returned.taxAmount);
  return { lineTotal: rupees(lineTotal), discountAmount: rupees(discountAmount), taxAmount: rupees(taxAmount), total: rupees(lineTotal - discountAmount + taxAmount) };
}

/**
 * How a return's value is settled: first it reduces what is still owed on the
 * bill, and the rest is paid back as a refund. A bill whose payment was never
 * recorded (amountPaid null) has nothing to refund.
 */
export function returnSettlement(input: { netTotal: string; amountPaid: string | null; returnTotal: string }): { balanceReduction: string; refund: string } {
  const value = paise(input.returnTotal);
  if (input.amountPaid === null) return { balanceReduction: rupees(value), refund: '0.00' };
  const owed = paise(input.netTotal) - paise(input.amountPaid);
  const reduction = owed <= 0n ? 0n : owed < value ? owed : value;
  return { balanceReduction: rupees(reduction), refund: rupees(value - reduction) };
}

/** Adds decimal amounts exactly, e.g. return totals. */
export function sumAmounts(values: Array<string | null | undefined>): string {
  return rupees(values.reduce((sum: bigint, value) => sum + paise(value), 0n));
}

/** Adds quantities exactly, e.g. what has been returned from a line. */
export function sumQuantities(values: string[]): string {
  return unscaled(values.reduce((sum, value) => sum + thousandths(value), 0n), 3, true);
}
