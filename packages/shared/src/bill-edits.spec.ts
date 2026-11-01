import { describe, expect, it } from 'vitest';

import { BILL_EDIT_CANCELLED_MESSAGE, BILL_EDIT_RETURNS_MESSAGE, billEditBlockReason, billEditSettlement } from './bill-edits.js';

describe('billEditBlockReason', () => {
  it('allows completed bills without returns only', () => {
    expect(billEditBlockReason({ status: 'COMPLETED', returnedTotal: '0.00' })).toBe('');
    expect(billEditBlockReason({ status: 'CANCELLED' })).toBe(BILL_EDIT_CANCELLED_MESSAGE);
    expect(billEditBlockReason({ status: 'COMPLETED', returnedTotal: '10.50' })).toBe(BILL_EDIT_RETURNS_MESSAGE);
    expect(billEditBlockReason({ status: 'COMPLETED', returnCount: 1 })).toBe(BILL_EDIT_RETURNS_MESSAGE);
    expect(billEditBlockReason({ status: 'DRAFT' })).toBe('Only a completed bill can be edited.');
  });
});

describe('billEditSettlement', () => {
  it('refunds what was paid above the new total', () => {
    expect(billEditSettlement({ amountPaid: '1180.00', total: '826.00' })).toEqual({ refund: '354.00', amountPaid: '826.00', balanceDue: '0.00' });
  });

  it('keeps the payment when the new total is the same or higher', () => {
    expect(billEditSettlement({ amountPaid: '500', total: '826.5' })).toEqual({ refund: '0.00', amountPaid: '500.00', balanceDue: '326.50' });
    expect(billEditSettlement({ amountPaid: '826.50', total: '826.50' })).toEqual({ refund: '0.00', amountPaid: '826.50', balanceDue: '0.00' });
    expect(billEditSettlement({ amountPaid: '0', total: '10' })).toEqual({ refund: '0.00', amountPaid: '0.00', balanceDue: '10.00' });
  });

  it('has nothing to refund when the payment was never recorded', () => {
    expect(billEditSettlement({ amountPaid: null, total: '99.99' })).toEqual({ refund: '0.00', amountPaid: null, balanceDue: '99.99' });
  });
});
