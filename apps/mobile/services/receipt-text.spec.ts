import { describe, expect, it } from 'vitest';

import { receiptShareText, type ReceiptTextSource } from './receipt-text';

const glass = { name: 'Clear Float Glass 5mm', quantity: 2, label: 'sq ft', price: 90, gstRate: '18', taxAmount: '32.40', lineTotal: '180.00' };
const taxed: ReceiptTextSource = {
  kind: 'sale', date: '2026-10-31T09:00:00Z', contact: 'Patil Constructions',
  gst: { taxType: 'INTRA_STATE', sellerGstin: '27AAPFU0939F1ZV', sellerStateCode: '27', buyerGstin: null, placeOfSupply: '27' },
  subtotal: '180.00', taxTotal: '32.40', total: '212.40', amountPaid: '212.40', paymentMethod: 'BANK_TRANSFER', items: [glass],
};
const heading = { title: 'Tax invoice', identifier: 'INV/2026-27/0005', shopName: 'QA Glass & Hardware' };

describe('receiptShareText', () => {
  it('lists the GST split for a bill that charges GST', () => {
    expect(receiptShareText(taxed, heading).split('\n')).toEqual([
      'Tax invoice · INV/2026-27/0005', 'QA Glass & Hardware', 'GSTIN 27AAPFU0939F1ZV', '31 Oct 2026', 'Customer: Patil Constructions',
      'Clear Float Glass 5mm · 2 sq ft × ₹90.00 = ₹180.00', 'Subtotal: ₹180.00', 'CGST: ₹16.20', 'SGST: ₹16.20', 'Total: ₹212.40', 'Paid: ₹212.40', 'Balance: ₹0.00', 'Payment method: BANK TRANSFER',
    ]);
  });

  it('has no GST rows for a bill without GST', () => {
    const text = receiptShareText({ ...taxed, chargeGst: false, items: [{ ...glass, gstRate: '0', taxAmount: '0.00' }], subtotal: '180.00', discountTotal: '30.00', taxTotal: '0.00', total: '150.00', amountPaid: '0.00' }, { ...heading, title: 'Bill of supply' });
    expect(text).toContain('Bill of supply · INV/2026-27/0005');
    expect(text).toContain('Subtotal: ₹180.00\nDiscount: −₹30.00\nTotal: ₹150.00\nPaid: ₹0.00\nBalance: ₹150.00');
    expect(text).not.toMatch(/GST:|CGST|SGST|IGST/);
  });

  it('marks hidden purchase prices as restricted', () => {
    const text = receiptShareText({ kind: 'purchase', date: '2026-10-31T09:00:00Z', contact: 'Saint Glass Distributors', total: null, taxTotal: undefined, items: [{ ...glass, price: undefined }] }, { title: 'Purchase receipt', identifier: 'PUR/2026-27/0001' });
    expect(text).toContain('Supplier: Saint Glass Distributors');
    expect(text).toContain('Subtotal: Restricted\nGST: Restricted\nTotal: Restricted price');
    expect(receiptShareText({ kind: 'purchase', date: '2026-10-31T09:00:00Z', contact: 'S', chargeGst: false, total: null, items: [] }, { title: 'Purchase receipt', identifier: 'P' })).not.toContain('GST');
  });

  it('gives the returned value and the net amount after a credit note', () => {
    const text = receiptShareText({ ...taxed, total: '424.80', returnedTotal: '212.40', netTotal: '212.40', amountPaid: '212.40' }, heading);
    expect(text).toContain('Total: ₹424.80\nReturned: −₹212.40\nNet amount: ₹212.40\nPaid: ₹212.40\nBalance: ₹0.00');
    expect(receiptShareText(taxed, heading)).not.toContain('Returned');
  });
});
