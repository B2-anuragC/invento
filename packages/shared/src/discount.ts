// Bill-level sales discount. A discount given at the time of sale lowers the
// taxable value, so it is split across the lines in proportion to their
// amounts and each line's GST is charged on what is left. The API, phones
// (offline bills) and admin all split with these functions, so a queued bill's
// total matches the server's. Amounts are decimal strings with up to two
// places; the arithmetic is in whole paise.

export type DiscountInput = { discountAmount?: string | null; discountPercent?: string | null };

export const DISCOUNT_AMOUNT_RULE_MESSAGE = 'Enter a discount from ₹0 up to the bill subtotal.';
export const DISCOUNT_PERCENT_RULE_MESSAGE = 'Enter a discount from 0% to 100%, with up to two decimals.';

const AMOUNT = /^\d{1,12}(?:\.\d{1,2})?$/;
const PERCENT = /^\d{1,3}(?:\.\d{1,2})?$/;

const toPaise = (value: string): bigint => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};
const fromPaise = (paise: bigint): string => `${paise / 100n}.${String(paise % 100n).padStart(2, '0')}`;

const has = (value: string | null | undefined): value is string => value != null && value !== '';

/** Why the discount cannot apply to this subtotal, or '' when it can (including no discount). */
export function discountError(subtotal: string, input: DiscountInput): string {
  if (has(input.discountAmount) && has(input.discountPercent)) return 'Enter the discount as an amount or a percentage, not both.';
  if (has(input.discountPercent)) return PERCENT.test(input.discountPercent) && toPaise(input.discountPercent) <= 10000n ? '' : DISCOUNT_PERCENT_RULE_MESSAGE;
  if (has(input.discountAmount)) return AMOUNT.test(input.discountAmount) && toPaise(input.discountAmount) <= toPaise(subtotal) ? '' : DISCOUNT_AMOUNT_RULE_MESSAGE;
  return '';
}

/** The discount for a subtotal: the amount entered, or the percentage rounded half-up to the paisa. Call after discountError. */
export function discountAmountFor(subtotal: string, input: DiscountInput): string {
  if (has(input.discountPercent)) return fromPaise((toPaise(subtotal) * toPaise(input.discountPercent) + 5000n) / 10000n);
  return has(input.discountAmount) ? fromPaise(toPaise(input.discountAmount)) : '0.00';
}

/**
 * Splits a discount across line amounts in proportion to them. Each line gets
 * the whole paise of its exact share; the paise left over go to the lines with
 * the largest remainders (earlier lines first), so the shares add up to the
 * discount exactly and none exceeds its line.
 */
export function splitDiscount(lineAmounts: string[], discount: string): string[] {
  const amounts = lineAmounts.map(toPaise);
  const total = amounts.reduce((sum, amount) => sum + amount, 0n);
  const target = toPaise(discount);
  if (target === 0n || total === 0n) return amounts.map(() => '0.00');
  const exact = amounts.map((amount) => amount * target);
  const shares = exact.map((value) => value / total);
  let leftover = target - shares.reduce((sum, share) => sum + share, 0n);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value % total }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const { index } of byRemainder) {
    if (leftover === 0n) break;
    shares[index] += 1n;
    leftover -= 1n;
  }
  return shares.map(fromPaise);
}
