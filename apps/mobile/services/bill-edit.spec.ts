import { describe, expect, it } from 'vitest';
import { BILL_EDIT_RETURNS_MESSAGE, WALK_IN_EDIT_MESSAGE } from '@invento/shared';

import { addEditLine, billEditInput, billEditPreview, canEditBill, editFormFromBill, editLineError, editLineKey, editedSummary, type EditableBill, type EditProduct } from './bill-edit';

// INV/2026-27/0033 on the QA shop: 3 handles at ₹180 + 18% GST, paid 637.20 by UPI.
const handle: EditProduct = { id: 'handle', name: 'Aluminium Door Handle', unit: 'PIECE', gstRate: '18', sellingPrice: '180', purchasePrice: '120', sellingOptions: [{ id: 'pack', name: 'Pack of 10', unit: 'PACK', quantity: '10', sellingPrice: '1700' }] };
const glass: EditProduct = { id: 'glass', name: 'Clear Float Glass 5mm', unit: 'SQUARE_FOOT', gstRate: '18', sellingPrice: '110', purchasePrice: '80' };
const products = { handle, glass };
const sale: EditableBill = { id: 'sale-1', status: 'COMPLETED', total: '637.20', amountPaid: '637.20', revision: 1, chargeGst: true, discountTotal: '0', discountPercent: null, items: [{ productId: 'handle', unit: 'PIECE', quantity: '3.000', sellingPrice: '180.00' }] };
const extra = { requestId: 'req_edit_1', reason: ' Customer took one handle less ', refundMethod: 'CASH' };

describe('editing the items of a saved bill', () => {
  it('offers Edit only on saved, completed bills without returns', () => {
    expect(canEditBill(sale, true)).toBe(true);
    expect(canEditBill(sale, false)).toBe(false);
    expect(canEditBill({ ...sale, status: 'CANCELLED' }, true)).toBe(false);
    expect(canEditBill({ ...sale, returnedTotal: '212.40' }, true)).toBe(false);
    expect(canEditBill({ ...sale, returns: [{}] }, true)).toBe(false);
    expect(canEditBill({ ...sale, syncState: 'pending' }, true)).toBe(false);
    expect(canEditBill({ ...sale, id: 'local_req_1' }, true)).toBe(false);
    expect(canEditBill({ ...sale, total: null }, true)).toBe(false);
    expect(BILL_EDIT_RETURNS_MESSAGE).toContain('returns');
  });

  it('starts from the bill as it is and asks for a change before saving', () => {
    const form = editFormFromBill('sale', sale);
    expect(form).toEqual({ lines: [{ productId: 'handle', unit: 'PIECE', quantity: '3', price: '180' }], chargeGst: true, discountMode: 'amount', discountValue: '' });
    expect(billEditPreview('sale', sale, form, products)).toMatchObject({ totalText: '637.20', refund: '0.00', balanceDue: '0.00', error: 'Change an item, quantity, price, discount or GST to save.' });
    expect(editFormFromBill('sale', { ...sale, discountTotal: '54', discountPercent: '10' })).toMatchObject({ discountMode: 'percent', discountValue: '10' });
    expect(editFormFromBill('sale', { ...sale, discountTotal: '20' })).toMatchObject({ discountMode: 'amount', discountValue: '20.00' });
  });

  it('previews the new total and the refund, and sends the edit as priced', () => {
    // 2 handles + 1 sq ft of glass with ₹20 off: 470 − 20 = 450 + 81 GST = 531.00; 106.20 back.
    const lines = addEditLine('sale', [{ productId: 'handle', unit: 'PIECE', quantity: '2', price: '180' }], glass);
    const form = { lines, chargeGst: true, discountMode: 'amount' as const, discountValue: '20' };
    expect(billEditPreview('sale', sale, form, products)).toMatchObject({ subtotal: 470, discount: 20, tax: 81, total: 531, totalText: '531.00', refund: '106.20', balanceDue: '0.00', error: '' });
    expect(billEditInput('sale', sale, form, products, extra)).toEqual({
      requestId: 'req_edit_1', revision: 1, reason: 'Customer took one handle less', chargeGst: true, expectedTotal: '531.00', refundMethod: 'CASH', discountAmount: '20',
      items: [{ productId: 'handle', unit: 'PIECE', quantity: '2', sellingPrice: '180.00' }, { productId: 'glass', unit: 'SQUARE_FOOT', quantity: '1', sellingPrice: '110.00' }],
    });
  });

  it('leaves the rest due when the total goes up, and sends no refund method', () => {
    const form = { ...editFormFromBill('sale', sale), lines: [{ productId: 'handle', unit: 'PIECE', quantity: '4', price: '180' }] };
    expect(billEditPreview('sale', sale, form, products)).toMatchObject({ totalText: '849.60', refund: '0.00', balanceDue: '212.40', error: '' });
    expect(billEditInput('sale', sale, form, products, extra)).not.toHaveProperty('refundMethod');
    // A walk-in sale must stay paid in full.
    expect(billEditPreview('sale', { ...sale, isWalkIn: true }, form, products).error).toBe(WALK_IN_EDIT_MESSAGE);
    // GST off brings it to 720.00 and is a change on its own.
    expect(billEditPreview('sale', sale, { ...editFormFromBill('sale', sale), chargeGst: false }, products)).toMatchObject({ totalText: '540.00', refund: '97.20', error: '' });
  });

  it('adds a selling option as its own line at the option price', () => {
    let lines = addEditLine('sale', editFormFromBill('sale', sale).lines, handle, 'pack');
    lines = addEditLine('sale', lines, handle, 'pack');
    expect(lines).toEqual([{ productId: 'handle', unit: 'PIECE', quantity: '3', price: '180' }, { productId: 'handle', optionId: 'pack', unit: 'PACK', quantity: '2', price: '1700' }]);
    expect(addEditLine('sale', lines, handle)[0].quantity).toBe('4');
    const input = billEditInput('sale', sale, { ...editFormFromBill('sale', sale), lines }, products, extra);
    expect(input.items[1]).toEqual({ productId: 'handle', sellingOptionId: 'pack', quantity: '2', sellingPrice: '1700.00' });
    expect(editLineKey(lines[1])).toBe('handle::pack::PACK');
  });

  it('explains what is wrong with a line', () => {
    expect(editLineError({ productId: 'handle', unit: 'PIECE', quantity: '0', price: '180' }, handle)).toBe('Enter a quantity greater than zero.');
    expect(editLineError({ productId: 'handle', unit: 'PIECE', quantity: '1.5', price: '180' }, handle)).toBe('Enter whole pieces.');
    expect(editLineError({ productId: 'handle', optionId: 'pack', unit: 'PACK', quantity: '1.5', price: '1700' }, handle)).toBe('Enter a whole number of options.');
    expect(editLineError({ productId: 'handle', optionId: 'gone', unit: 'PACK', quantity: '1', price: '1700' }, handle)).toContain('no longer available');
    expect(editLineError({ productId: 'glass', unit: 'SQUARE_FOOT', quantity: '2.5', price: '' }, glass)).toBe('Enter a price greater than zero.');
    expect(editLineError({ productId: 'glass', unit: 'SQUARE_FOOT', quantity: '2.5', price: '110.' }, glass)).toBe('');
    expect(editLineError({ productId: 'x', quantity: '1', price: '1' }, undefined)).toContain('could not be loaded');
    const form = { ...editFormFromBill('sale', sale), lines: [{ productId: 'handle', unit: 'PIECE', quantity: '', price: '180' }] };
    expect(billEditPreview('sale', sale, form, products).error).toBe('Aluminium Door Handle: Enter a quantity greater than zero.');
    expect(billEditPreview('sale', sale, { ...form, lines: [] }, products).error).toBe('Add at least one item.');
    expect(billEditPreview('sale', sale, { ...editFormFromBill('sale', sale), discountValue: '900' }, products).discountError).not.toBe('');
  });

  it('edits a purchase: one line per product at the typed price, no discount', () => {
    const purchase: EditableBill = { id: 'purchase-1', status: 'COMPLETED', total: '1416.00', amountPaid: null, revision: 3, chargeGst: true, items: [{ productId: 'glass', quantity: '15', purchasePrice: '80' }] };
    const form = editFormFromBill('purchase', purchase);
    expect(form.lines).toEqual([{ productId: 'glass', quantity: '15', price: '80' }]);
    const lines = addEditLine('purchase', [{ ...form.lines[0], quantity: '10' }], handle);
    expect(lines[1]).toEqual({ productId: 'handle', quantity: '1', price: '120' });
    // 800 + 120 = 920 + 165.60 GST; nothing was paid, so all of it is due.
    expect(billEditPreview('purchase', purchase, { ...form, lines }, products)).toMatchObject({ totalText: '1085.60', refund: '0.00', balanceDue: '1085.60', error: '' });
    expect(billEditInput('purchase', purchase, { ...form, lines }, products, extra)).toEqual({ requestId: 'req_edit_1', revision: 3, reason: 'Customer took one handle less', chargeGst: true, expectedTotal: '1085.60', items: [{ productId: 'glass', quantity: '10', purchasePrice: '80.00' }, { productId: 'handle', quantity: '1', purchasePrice: '120.00' }] });
  });

  it('describes when and why a bill was edited', () => {
    expect(editedSummary({ editedAt: null })).toBeNull();
    const summary = editedSummary({ editedAt: '2026-11-01T04:16:00Z', editReason: 'Wrong quantity' });
    expect(summary?.title).toMatch(/^Edited · 1 Nov 2026, /);
    expect(summary?.reason).toBe('Wrong quantity');
  });
});
