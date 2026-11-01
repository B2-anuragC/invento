import { describe, expect, it } from 'vitest';

import { canReturnBill, noteSettlement, returnPreview, returnSummary, returnableLines, type ReturnBill } from './bill-returns';

// INV/2026-27/0026 on the QA shop: 2 handles at ₹180 + 18% GST, paid in cash, one returned on CN/2026-27/0001.
const handles = { id: 'line-1', name: 'Aluminium Door Handle', quantity: '2', lineTotal: '360', discountAmount: '0', taxAmount: '64.8', returnedQuantity: '1' };
const note = { id: 'cn-1', documentNumber: 'CN/2026-27/0001', returnDate: '2026-11-01T03:16:00Z', total: '212.4', refundAmount: '212.4', refundMethod: 'CASH', items: [{ saleItemId: 'line-1', quantity: '1', lineTotal: '180', discountAmount: '0', taxAmount: '32.4' }] };
const sale: ReturnBill = { id: 'sale-1', kind: 'sale', status: 'COMPLETED', total: '424.8', returnedTotal: '212.4', netTotal: '212.4', amountPaid: '212.4', returns: [note], items: [handles] };
const fresh: ReturnBill = { id: 'sale-2', kind: 'sale', status: 'COMPLETED', total: '424.8', amountPaid: '424.8', items: [{ ...handles, returnedQuantity: '0' }], returns: [] };

describe('returns of saved bills', () => {
  it('works out what is left on each line from the notes', () => {
    expect(returnableLines(sale)).toEqual([{ id: 'line-1', name: 'Aluminium Door Handle', sold: '2', returned: '1', left: '1' }]);
    expect(returnableLines(fresh)[0].left).toBe('2');
    // Without the notes the returned quantity still counts.
    expect(returnableLines({ ...sale, returns: undefined })[0].left).toBe('1');
  });

  it('offers a return only on saved, completed bills with something left', () => {
    expect(canReturnBill(fresh, true)).toBe(true);
    expect(canReturnBill(fresh, false)).toBe(false);
    expect(canReturnBill({ ...fresh, status: 'CANCELLED' }, true)).toBe(false);
    expect(canReturnBill({ ...fresh, syncState: 'pending' }, true)).toBe(false);
    expect(canReturnBill({ ...fresh, id: 'local_req_1' }, true)).toBe(false);
    expect(canReturnBill({ ...sale, items: [{ ...handles, returnedQuantity: '2' }], returns: [{ ...note, items: [{ ...note.items[0], quantity: '2' }] }] }, true)).toBe(false);
  });

  it('previews the last unit at exactly what is left and refunds what was paid', () => {
    const preview = returnPreview(sale, { 'line-1': '1' });
    expect(preview).toMatchObject({ error: '', total: '212.40', balanceReduction: '0.00', refund: '212.40', items: [{ itemId: 'line-1', quantity: '1' }] });
  });

  it('takes a return off what is still owed before refunding', () => {
    const credit = { ...fresh, amountPaid: '100' };
    expect(returnPreview(credit, { 'line-1': '1' })).toMatchObject({ total: '212.40', balanceReduction: '212.40', refund: '0.00' });
    expect(returnPreview(credit, { 'line-1': '2' })).toMatchObject({ total: '424.80', balanceReduction: '324.80', refund: '100.00' });
    // A bill whose payment was never confirmed has nothing to refund.
    expect(returnPreview({ ...fresh, amountPaid: null }, { 'line-1': '2' })).toMatchObject({ balanceReduction: '424.80', refund: '0.00' });
  });

  it('splits a discount and GST in proportion like the API', () => {
    const discounted: ReturnBill = { ...fresh, total: '106.2', amountPaid: '106.2', items: [{ id: 'g', name: 'Glass', quantity: '3', lineTotal: '100', discountAmount: '10', taxAmount: '16.2' }] };
    expect(returnPreview(discounted, { g: '1' }).total).toBe('35.40');
    expect(returnPreview(discounted, { g: '3' }).total).toBe('106.20');
  });

  it('explains quantities that cannot be returned', () => {
    expect(returnPreview(sale, {}).error).toBe('Enter a quantity for at least one item.');
    expect(returnPreview(sale, { 'line-1': '  ' }).error).toBe('Enter a quantity for at least one item.');
    expect(returnPreview(sale, { 'line-1': '2' }).error).toBe('Aluminium Door Handle: Only 1 can be returned.');
    expect(returnPreview(sale, { 'line-1': '0' }).lines[0].error).toMatch(/greater than zero/);
    expect(returnPreview(sale, { 'line-1': '2' }).items).toEqual([]);
  });

  it('previews no amounts when prices are hidden', () => {
    const hidden: ReturnBill = { id: 'p', kind: 'purchase', status: 'COMPLETED', total: null, amountPaid: null, items: [{ id: 'l', name: 'Glass', quantity: '5' }] };
    expect(returnPreview(hidden, { l: '2' })).toMatchObject({ error: '', total: null, refund: null, items: [{ itemId: 'l', quantity: '2' }] });
  });

  it('describes returns for lists and how a note was settled', () => {
    expect(returnSummary(sale)).toBe('Returned ₹212.40 · CN/2026-27/0001');
    expect(returnSummary({ returnedTotal: '300', returns: [note, { ...note, id: 'cn-2' }] })).toBe('Returned ₹300.00 · 2 notes');
    expect(returnSummary(fresh)).toBe('');
    expect(noteSettlement('sale', note)).toBe('Refunded ₹212.40 · Cash');
    expect(noteSettlement('sale', { total: '212.4', refundAmount: '100', refundMethod: 'UPI' })).toBe('Refunded ₹100.00 · UPI and ₹112.40 off the amount due');
    expect(noteSettlement('purchase', { total: '50', refundAmount: '0' })).toBe('₹50.00 off the amount owed');
    expect(noteSettlement('purchase', { refundAmount: '0' })).toBe('');
  });
});
