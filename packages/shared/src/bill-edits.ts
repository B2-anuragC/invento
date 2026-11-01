// Editing the items of a completed sale or purchase. The API refuses an edit
// with these messages and works out the refund with the same function the
// apps use to preview it, so the edit form always shows what will happen.

export const BILL_EDIT_CANCELLED_MESSAGE = 'A cancelled bill cannot be edited.';
export const BILL_EDIT_RETURNS_MESSAGE = 'This bill has returns, so its items cannot be edited. Return items or make a new bill instead.';

const paise = (value: string): bigint => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole || '0') * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0'));
};
const rupees = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

/** Why the items of a bill cannot be edited, or '' when they can. */
export function billEditBlockReason(bill: { status: string; returnedTotal?: string | number | null; returnCount?: number }): string {
  if (bill.status === 'CANCELLED') return BILL_EDIT_CANCELLED_MESSAGE;
  if (bill.status !== 'COMPLETED') return 'Only a completed bill can be edited.';
  if ((bill.returnCount ?? 0) > 0 || Number(bill.returnedTotal ?? 0) > 0) return BILL_EDIT_RETURNS_MESSAGE;
  return '';
}

/**
 * How an edit settles money already paid: when the new total is below it, the
 * difference is refunded and the bill counts as paid in full; otherwise the
 * payment stays and the rest is due. A bill whose payment was never recorded
 * (amountPaid null) has nothing to refund.
 */
export function billEditSettlement(input: { amountPaid: string | null; total: string }): { refund: string; amountPaid: string | null; balanceDue: string } {
  const total = paise(input.total);
  if (input.amountPaid === null) return { refund: '0.00', amountPaid: null, balanceDue: rupees(total) };
  const paid = paise(input.amountPaid);
  if (paid > total) return { refund: rupees(paid - total), amountPaid: rupees(total), balanceDue: '0.00' };
  return { refund: '0.00', amountPaid: rupees(paid), balanceDue: rupees(total - paid) };
}

/** A walk-in sale is always paid in full, so an edit cannot leave money owing on it. */
export const WALK_IN_EDIT_MESSAGE = 'A walk-in sale must stay paid in full, so its total cannot go above what was paid. Make a new sale for the extra items.';
