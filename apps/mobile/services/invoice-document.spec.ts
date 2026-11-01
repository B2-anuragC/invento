import { describe, expect, it } from 'vitest';

import { escapeHtml, invoiceFileName, invoiceHtml, type InvoiceSource } from './invoice-document';

const shop = { name: 'QA Glass & Hardware', address: 'Shop 12, Station Road, Pune 411001', phone: '+91 98765 43210', email: null };
const glass = { id: 'line-1', name: 'Clear Float Glass 5mm', quantity: 2, label: 'sq ft', unit: 'SQUARE_FOOT', price: 90, gstRate: '18', taxAmount: '32.4', lineTotal: '180', hsnCode: '700529' };
const intraState: InvoiceSource = {
  id: 'cmvw78cx70004132s83vhpwqq', kind: 'sale', date: '2026-10-31T09:00:00Z', documentNumber: 'INV/2026-27/0005', invoice: 'PO-77',
  contact: 'Patil Constructions', contactPhone: '+91 99220 11223', contactAddress: 'Plot 4, MIDC, Pune',
  gst: { taxType: 'INTRA_STATE', sellerGstin: '27AAPFU0939F1ZV', sellerStateCode: '27', buyerGstin: '27AAPFU0939F1ZV', placeOfSupply: '27' },
  subtotal: '180', taxTotal: '32.4', total: '212.4', amountPaid: '100', dueDate: '2026-11-15', payments: [{ method: 'UPI', kind: 'PAYMENT' }], paymentMethod: 'UPI', note: 'Deliver after 5 pm',
  items: [glass],
};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('invoiceHtml', () => {
  it('prints a tax invoice with seller, buyer, place of supply and the CGST/SGST split', () => {
    const html = invoiceHtml(intraState, shop);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('@page { size: A4');
    const body = text(html);
    for (const expected of [
      'Tax invoice', 'Invoice number: INV/2026-27/0005', 'Reference PO-77', 'Date: 31 Oct 2026', 'Place of supply: Maharashtra (27)', 'Tax payable on reverse charge: No',
      'QA Glass &amp; Hardware', 'GSTIN 27AAPFU0939F1ZV · Maharashtra (27)', 'Bill to Patil Constructions Plot 4, MIDC, Pune +91 99220 11223 GSTIN 27AAPFU0939F1ZV',
      'UPI', 'Paid ₹100.00 · Balance ₹112.40', 'Due 15 Nov 2026', 'Clear Float Glass 5mm 700529 2 sq ft ₹90.00 ₹180.00 ₹16.20 9% ₹16.20 9% ₹212.40',
      'CGST ₹16.20', 'SGST ₹16.20', 'Total ₹212.40', 'Deliver after 5 pm', 'For QA Glass &amp; Hardware Authorised signatory',
    ]) expect(body).toContain(expected);
    expect(html).toContain('<title>INV-2026-27-0005</title>');
  });

  it('uses IGST between states and lists each rate when a bill has several', () => {
    const fittings = { ...glass, id: 'line-2', name: 'Handle', hsnCode: '830241', gstRate: '28', taxAmount: '50.4', lineTotal: '180' };
    const html = invoiceHtml({ ...intraState, gst: { ...intraState.gst!, taxType: 'INTER_STATE', buyerGstin: '29AAPFU0939F1ZR', placeOfSupply: '29' }, items: [glass, fittings], taxTotal: '82.8', total: '442.8' }, shop);
    const body = text(html);
    expect(body).toContain('Place of supply: Karnataka (29)');
    expect(body).toContain('₹32.40 18%');
    expect(body).toContain('IGST ₹82.80');
    expect(body).toContain('GST rate Taxable value IGST 18% ₹180.00 ₹32.40 28% ₹180.00 ₹50.40');
    expect(body).not.toContain('CGST');
  });

  it('prints a bill of supply and older sales without GST claims', () => {
    const supply = text(invoiceHtml({ ...intraState, gst: { ...intraState.gst!, taxType: 'UNREGISTERED', sellerGstin: null, buyerGstin: null } }, shop));
    expect(supply).toContain('Bill of supply');
    expect(supply).not.toMatch(/Place of supply|reverse charge|GSTIN/);
    const older = text(invoiceHtml({ ...intraState, documentNumber: null, gst: null }, shop));
    expect(older).toContain('Sale receipt');
    expect(older).toContain('Invoice / transaction identifier: PO-77');
    expect(older).toContain('GST ₹32.40');
    expect(older).not.toContain('CGST');
  });

  it('prints a sale without GST as a Bill of supply with no GST columns or rows', () => {
    const noGst = { ...intraState, chargeGst: false, items: [{ ...glass, gstRate: '0', taxAmount: '0.00' }], taxTotal: '0.00', total: '180.00' };
    const html = invoiceHtml(noGst, shop);
    const body = text(html);
    expect(body).toContain('Bill of supply');
    expect(body).toContain('Invoice number: INV/2026-27/0005');
    expect(body).toContain('# Item HSN Qty Rate Amount');
    expect(body).toContain('Clear Float Glass 5mm 700529 2 sq ft ₹90.00 ₹180.00');
    expect(body).toContain('Total ₹180.00');
    expect(body).toContain('Computer-generated bill of supply');
    expect(body).not.toMatch(/CGST|SGST|IGST|Taxable value|GST rate|Place of supply|reverse charge/);
    // The shop and the buyer keep their GSTINs.
    expect(body).toContain('GSTIN 27AAPFU0939F1ZV');
    // With a discount the amount column is net of it.
    const discounted = text(invoiceHtml({ ...noGst, subtotal: '180', discountTotal: '30', items: [{ ...noGst.items[0], discountAmount: '30' }], total: '150.00' }, shop));
    expect(discounted).toContain('# Item HSN Qty Rate Discount Amount');
    expect(discounted).toContain('₹90.00 ₹30.00 ₹150.00');
    expect(discounted).toContain('Subtotal ₹180.00 Discount −₹30.00 Total ₹150.00');
  });

  it('prints a purchase without GST with no GST column', () => {
    const body = text(invoiceHtml({ ...intraState, kind: 'purchase', gst: null, chargeGst: false, documentNumber: 'PUR/2026-27/0002', items: [{ ...glass, hsnCode: null, gstRate: '0', taxAmount: '0.00' }], taxTotal: '0.00', total: '180.00' }, shop));
    expect(body).toContain('Purchase receipt');
    expect(body).toContain('# Item Qty Rate Amount');
    expect(body).not.toMatch(/GST|Taxable value/);
  });

  it('escapes everything people type', () => {
    const html = invoiceHtml({ ...intraState, contact: '<script>alert(1)</script>', note: '"quoted" & <b>bold</b>', items: [{ ...glass, name: '<img src=x onerror=alert(1)>' }] }, { ...shop, name: 'A&B <Glass>' });
    expect(html).not.toMatch(/<script>|<img|<b>/);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('A&amp;B &lt;Glass&gt;');
    expect(escapeHtml(`'`)).toBe('&#39;');
  });

  it('keeps restricted purchase prices out of the document', () => {
    const purchase: InvoiceSource = { id: 'cmvvzyli3000taa7bskex1pr9', kind: 'purchase', date: '2026-10-31T09:00:00Z', documentNumber: 'PUR/2026-27/0001', invoice: 'SUP-101', contact: 'Saint Glass', total: null, amountPaid: null, paymentMethod: 'CASH', items: [{ ...glass, price: undefined, lineTotal: undefined, taxAmount: undefined }] };
    const html = invoiceHtml(purchase, shop);
    const body = text(html);
    expect(body).toContain('Purchase receipt');
    expect(body).toContain('Purchase number: PUR/2026-27/0001');
    expect(body).toContain('Supplier invoice SUP-101');
    expect(body).toContain('Supplier Saint Glass');
    expect(body).toContain('Prices are hidden for your role.');
    expect(body).not.toMatch(/₹|Rate|Taxable value|Authorised signatory/);
  });

  it('shows a discount column, the discount and the taxable value net of it', () => {
    const putty = { ...glass, id: 'line-2', name: 'Putty', hsnCode: '3214', gstRate: '5', quantity: 1, label: 'kg', unit: 'KG', price: 200, lineTotal: '200', taxAmount: '9', discountAmount: '20' };
    const html = invoiceHtml({ ...intraState, subtotal: '1200', discountTotal: '120', discountPercent: '10', taxTotal: '171', total: '1251', amountPaid: '1251', items: [{ ...glass, quantity: 1, price: 1000, lineTotal: '1000', taxAmount: '162', discountAmount: '100' }, putty] }, shop);
    const body = text(html);
    expect(html).toContain('<th class="num">Discount</th>');
    expect(body).toContain('Clear Float Glass 5mm 700529 1 sq ft ₹1,000.00 ₹100.00 ₹900.00 ₹81.00 9% ₹81.00 9% ₹1,062.00');
    expect(body).toContain('Subtotal ₹1,200.00 Discount (10%) −₹120.00 Taxable value ₹1,080.00 CGST ₹85.50 SGST ₹85.50 Total ₹1,251.00');
    expect(body).toContain('GST rate Taxable value CGST SGST 5% ₹180.00 ₹4.50 ₹4.50 18% ₹900.00 ₹81.00 ₹81.00');
    expect(invoiceHtml(intraState, shop)).not.toContain('Discount');
  });

  it('stamps a cancelled bill with its escaped reason', () => {
    const html = invoiceHtml({ ...intraState, status: 'CANCELLED', cancelReason: 'Returned <all>' }, shop);
    expect(html).toContain('<div class="cancelled">Cancelled · Returned &lt;all&gt;</div>');
    expect(invoiceHtml(intraState, shop)).not.toContain('class="cancelled"');
  });

  it('shows the HSN column only when a line has a code', () => {
    expect(invoiceHtml(intraState, shop)).toContain('<th>HSN</th>');
    expect(invoiceHtml({ ...intraState, items: [{ ...glass, hsnCode: null }] }, shop)).not.toContain('<th>HSN</th>');
  });
});

describe('invoiceFileName', () => {
  it('names the PDF after the bill number with safe characters only', () => {
    expect(invoiceFileName(intraState)).toBe('INV-2026-27-0005.pdf');
    expect(invoiceFileName({ kind: 'purchase', id: 'x', documentNumber: 'PUR/2026-27/0001' })).toBe('PUR-2026-27-0001.pdf');
    expect(invoiceFileName({ kind: 'sale', id: 'cmvvzivll0005aa7bgbgvjik4', documentNumber: null, invoice: null })).toBe('Sale-GBGVJIK4.pdf');
    expect(invoiceFileName({ kind: 'sale', id: 'x', documentNumber: null, invoice: 'Bill #12 / Patil' })).toBe('Bill-12-Patil.pdf');
  });
});
