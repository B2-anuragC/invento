import { chargesGst, gstRateSummary, halfRate, splitLineTax } from '@invento/shared';

import { formatDate, formatMoney, formatQuantity } from './format';
import { receiptTitle, stateLabel, taxTotalRows, type SaleGstDetails } from './gst';
import { noteName, noteSettlement } from './bill-returns';
import { paymentMethodsSummary } from './payment-methods';
import { paymentBalance } from './transaction-accounting';
import { receiptIdentity, transactionTitle } from './transaction-labels';

// The A4 document printed or saved as a PDF from a receipt (CGST Rule 46 for
// tax invoices), and the credit or debit note for goods returned on a bill
// (Rule 53), built from the same layout. Everything a person typed (shop, contact and product names,
// notes) is escaped, so the document stays plain markup whatever it contains.

export type InvoiceShop = { name: string; address?: string | null; phone?: string | null; email?: string | null };

export type InvoiceSource = {
  id: string;
  kind: 'sale' | 'purchase';
  date: string;
  invoice?: string | null;
  documentNumber?: string | null;
  syncState?: string;
  status?: string;
  cancelReason?: string | null;
  contact: string;
  contactPhone?: string | null;
  contactAddress?: string | null;
  gst?: SaleGstDetails | null;
  /** False when the bill charged no GST: no GST columns or rows. Missing on older bills, which did. */
  chargeGst?: boolean | null;
  total?: string | number | null;
  subtotal?: string | number;
  discountTotal?: string | number;
  discountPercent?: string | number | null;
  taxTotal?: string | number;
  amountPaid?: string | number | null;
  dueDate?: string | null;
  payments?: { method?: string | null; kind?: string | null }[];
  paymentMethod?: string;
  note?: string | null;
  /** The bill's credit or debit notes, listed under its totals with the net amount. */
  returns?: { documentNumber: string; returnDate: string; total?: string | number | null }[];
  netTotal?: string | number | null;
  /** Set on a credit or debit note: the bill the goods came from and how the note's value was settled. */
  returnOf?: { number: string; date: string; settlement: string; reason?: string | null };
  items: { id: string; name: string; quantity: number; label: string; unit?: string; price?: number; gstRate?: string | number; taxAmount?: string | number; lineTotal?: string | number; discountAmount?: string | number; hsnCode?: string | null }[];
};

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);

const money = (value: number | string | undefined) => escapeHtml(formatMoney(Number(value ?? 0)));
const sentenceCase = (caption: string) => caption.charAt(0) + caption.slice(1).toLowerCase();
const lines = (...values: (string | null | undefined | false)[]) => values.filter(Boolean).map((value) => `<div>${value}</div>`).join('');

/** "INV-2026-27-0006.pdf": the bill's number with only letters, digits and hyphens. */
export function invoiceFileName(source: Pick<InvoiceSource, 'kind' | 'id' | 'documentNumber' | 'invoice'>): string {
  const base = transactionTitle(source.kind, { id: source.id, documentNumber: source.documentNumber, invoiceNumber: source.invoice }).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'invoice'}.pdf`;
}

type NoteSource = Omit<InvoiceSource, 'items'> & { items: (InvoiceSource['items'][number] & { lineKey?: string })[] };
type NoteRecord = { id: string; documentNumber: string; returnDate: string; subtotal?: string | number; discountTotal?: string | number; taxTotal?: string | number; total?: string | number; refundAmount?: string | number; refundMethod?: string | null; reason?: string | null; items: { saleItemId?: string; purchaseItemId?: string; quantity: string | number; lineTotal?: string | number; discountAmount?: string | number; gstRate?: string | number; taxAmount?: string | number }[] };

/**
 * The credit note (sale) or debit note (purchase) for one return on a bill:
 * the returned lines with their amounts, under the note's own number and date,
 * with the shop, contact and GST details of the bill it refers to.
 */
export function returnNoteSource(bill: NoteSource, note: NoteRecord): InvoiceSource {
  const lines = new Map(bill.items.map((item) => [item.id, item]));
  const priced = note.total != null && bill.total != null;
  return {
    ...bill, id: note.id, documentNumber: note.documentNumber, invoice: null, date: note.returnDate, status: undefined, cancelReason: null, syncState: undefined,
    subtotal: note.subtotal, discountTotal: note.discountTotal, discountPercent: null, taxTotal: note.taxTotal, total: priced ? note.total : null,
    amountPaid: null, dueDate: null, payments: [], paymentMethod: undefined, note: null, returns: undefined, netTotal: undefined,
    returnOf: { number: transactionTitle(bill.kind, { id: bill.id, documentNumber: bill.documentNumber, invoiceNumber: bill.invoice }), date: bill.date, settlement: noteSettlement(bill.kind, note), reason: note.reason },
    items: note.items.map((item, index) => {
      const line = lines.get((bill.kind === 'sale' ? item.saleItemId : item.purchaseItemId) ?? '');
      return { id: `${note.id}:${index}`, name: line?.name ?? 'Product', label: line?.label ?? '', unit: line?.unit, hsnCode: line?.hsnCode, quantity: Number(item.quantity), price: priced ? line?.price : undefined, gstRate: item.gstRate ?? line?.gstRate, lineTotal: item.lineTotal, discountAmount: item.discountAmount, taxAmount: item.taxAmount };
    }),
  };
}

export function invoiceHtml(source: InvoiceSource, shop: InvoiceShop): string {
  const sale = source.kind === 'sale';
  const gst = sale ? source.gst ?? null : null;
  const taxType = gst?.taxType;
  const returnOf = source.returnOf;
  const billTitle = receiptTitle(source.kind, gst, source.documentNumber, source.chargeGst);
  const title = returnOf ? (sale ? 'Credit note' : 'Debit note') : billTitle;
  const taxed = chargesGst(source.chargeGst);
  const identity = returnOf
    ? { caption: `${title} number`, value: source.documentNumber ?? '', note: `Against ${sale ? 'invoice' : 'purchase'} ${returnOf.number} dated ${formatDate(returnOf.date)}` }
    : receiptIdentity(source.kind, { id: source.id, documentNumber: source.documentNumber, invoiceNumber: source.invoice, syncState: source.syncState });
  // A note against a tax invoice carries the same GST details.
  const taxInvoice = billTitle === 'Tax invoice';
  // A role that cannot see purchase prices gets quantities only.
  const restricted = source.total == null || source.items.some((item) => item.price == null);
  // A bill without GST has no tax columns, and its taxable value is simply the amount.
  const heads = !taxed ? [] : taxType === 'INTRA_STATE' ? ['CGST', 'SGST'] : [taxType === 'INTER_STATE' ? 'IGST' : 'GST'];
  const discounted = Number(source.discountTotal ?? 0) > 0;
  // Purchases and products without a code have no HSN to show.
  const showHsn = source.items.some((item) => item.hsnCode);

  const itemRows = source.items.map((item, index) => {
    const quantity = item.unit ? formatQuantity(item.quantity, item.unit) : `${item.quantity} ${item.label}`;
    const cells = [`<td class="num">${index + 1}</td>`, `<td>${escapeHtml(item.name)}</td>`, ...(showHsn ? [`<td>${escapeHtml(item.hsnCode ?? '')}</td>`] : []), `<td class="num">${escapeHtml(quantity)}</td>`];
    if (!restricted) {
      const share = Number(item.discountAmount ?? 0);
      const taxable = Number(item.lineTotal ?? ((item.quantity * (item.price ?? 0)).toFixed(2))) - share;
      const rate = Number(item.gstRate ?? 0);
      const split = splitLineTax(item.taxAmount ?? 0, 'INTRA_STATE');
      const taxCells = !taxed ? [] : taxType === 'INTRA_STATE'
        ? [`${money(split.cgst)}<span class="rate">${halfRate(rate)}%</span>`, `${money(split.sgst)}<span class="rate">${halfRate(rate)}%</span>`]
        : [`${money(item.taxAmount)}<span class="rate">${rate}%</span>`];
      cells.push(`<td class="num">${money(item.price)}</td>`, ...(discounted ? [`<td class="num">${money(share)}</td>`] : []), ...(taxed ? [`<td class="num">${money(taxable)}</td>`] : []), ...taxCells.map((cell) => `<td class="num">${cell}</td>`), `<td class="num">${money(taxable + Number(item.taxAmount ?? 0))}</td>`);
    }
    return `<tr>${cells.join('')}</tr>`;
  });
  const itemHead = ['<th class="num">#</th>', '<th>Item</th>', ...(showHsn ? ['<th>HSN</th>'] : []), '<th class="num">Qty</th>', ...(restricted ? [] : ['<th class="num">Rate</th>', ...(discounted ? ['<th class="num">Discount</th>'] : []), ...(taxed ? ['<th class="num">Taxable value</th>'] : []), ...heads.map((head) => `<th class="num">${head}</th>`), '<th class="num">Amount</th>'])];

  const rates = taxInvoice && !restricted ? gstRateSummary(source.items.map((item) => ({ gstRate: item.gstRate ?? 0, lineTotal: item.lineTotal ?? 0, discountAmount: item.discountAmount ?? 0, taxAmount: item.taxAmount ?? 0 })), taxType === 'INTER_STATE' ? 'INTER_STATE' : 'INTRA_STATE') : [];
  const rateSummary = rates.length > 1
    ? `<table class="summary"><thead><tr><th class="num">GST rate</th><th class="num">Taxable value</th>${heads.map((head) => `<th class="num">${head}</th>`).join('')}</tr></thead><tbody>${rates.map((row) => `<tr><td class="num">${row.rate}%</td><td class="num">${money(row.taxableValue)}</td>${(taxType === 'INTRA_STATE' ? [row.cgst, row.sgst] : [row.igst]).map((amount) => `<td class="num">${money(amount)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '';

  // A bill with returns lists its notes and its net amount under the total; the bill itself stays as issued.
  const notes = restricted || returnOf ? [] : source.returns ?? [];
  const returnRows = notes.length ? `${notes.map((entry) => `<tr><td>Returned · ${sale ? 'Credit' : 'Debit'} note ${escapeHtml(entry.documentNumber)} · ${escapeHtml(formatDate(entry.returnDate))}</td><td class="num">−${money(entry.total ?? 0)}</td></tr>`).join('')}<tr class="grand"><td>Net amount</td><td class="num">${money(source.netTotal ?? 0)}</td></tr>` : '';
  const balance = paymentBalance(source);
  const methods = paymentMethodsSummary(source.payments, source.paymentMethod);
  const totals = restricted
    ? '<p class="muted">Prices are hidden for your role.</p>'
    : `<table class="totals"><tbody>${discounted ? `<tr><td>Subtotal</td><td class="num">${money(source.subtotal)}</td></tr><tr><td>Discount${Number(source.discountPercent ?? 0) > 0 ? ` (${Number(source.discountPercent)}%)` : ''}</td><td class="num">−${money(source.discountTotal)}</td></tr>` : ''}${taxed ? `<tr><td>Taxable value</td><td class="num">${money(Number(source.subtotal ?? 0) - Number(source.discountTotal ?? 0))}</td></tr>` : ''}${taxTotalRows(source.items, taxType, source.taxTotal ?? 0, source.chargeGst).map((row) => `<tr><td>${row.label}</td><td class="num">${money(row.amount)}</td></tr>`).join('')}<tr class="grand"><td>Total</td><td class="num">${money(source.total ?? 0)}</td></tr>${returnRows}</tbody></table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(invoiceFileName(source).replace(/\.pdf$/, ''))}</title>
<style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #1f2a24; font: 9.5pt/1.45 -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif; }
.top { display: flex; justify-content: space-between; gap: 18px; border-bottom: 2px solid #176b50; padding-bottom: 10px; }
h1 { font-size: 15pt; margin: 0 0 2px; }
h2 { font-size: 13pt; margin: 0 0 4px; color: #176b50; text-transform: uppercase; letter-spacing: 0.5px; }
.doc { text-align: right; }
.cancelled { display: inline-block; border: 2px solid #a74737; color: #a74737; font-weight: 700; padding: 2px 8px; margin-bottom: 4px; text-transform: uppercase; }
.muted, .rate { color: #5b6660; }
.rate { display: block; font-size: 7.5pt; }
.parties { display: flex; gap: 12px; margin: 12px 0; }
.box { flex: 1; border: 1px solid #d6ddd9; border-radius: 4px; padding: 8px 10px; }
.label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.6px; color: #5b6660; margin-bottom: 2px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #d6ddd9; padding: 4px 6px; vertical-align: top; text-align: left; }
th { background: #eef4f0; font-size: 8pt; }
.num { text-align: right; white-space: nowrap; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
.summary { width: 60%; margin-top: 10px; }
.totals { width: 45%; margin: 10px 0 0 auto; }
.totals td { border: none; padding: 2px 6px; }
.totals .grand td { border-top: 1px solid #1f2a24; font-weight: 700; font-size: 11pt; padding-top: 4px; }
.note { margin-top: 12px; }
.footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; margin-top: 28px; page-break-inside: avoid; }
.sign { text-align: center; min-width: 200px; }
.sign .line { border-top: 1px solid #1f2a24; margin-top: 40px; padding-top: 4px; }
</style>
</head>
<body>
<header class="top">
<div>
<h1>${escapeHtml(shop.name)}</h1>
${lines(escapeHtml(shop.address), [shop.phone, shop.email].filter(Boolean).map(escapeHtml).join(' · '), gst?.sellerGstin && `<strong>GSTIN</strong> ${escapeHtml(gst.sellerGstin)}${gst.sellerStateCode ? ` · ${escapeHtml(stateLabel(gst.sellerStateCode))}` : ''}`)}
</div>
<div class="doc">
<h2>${escapeHtml(title)}</h2>
${source.status === 'CANCELLED' ? `<div class="cancelled">Cancelled${source.cancelReason ? ` · ${escapeHtml(source.cancelReason)}` : ''}</div>` : ''}
${lines(`${escapeHtml(sentenceCase(identity.caption))}: <strong>${escapeHtml(identity.value)}</strong>`, identity.note && escapeHtml(identity.note), `Date: ${escapeHtml(formatDate(source.date))}`, taxInvoice && gst?.placeOfSupply && `Place of supply: ${escapeHtml(stateLabel(gst.placeOfSupply))}`, taxInvoice && 'Tax payable on reverse charge: No')}
</div>
</header>
<section class="parties">
<div class="box">
<div class="label">${sale ? 'Bill to' : 'Supplier'}</div>
<strong>${escapeHtml(source.contact)}</strong>
${lines(escapeHtml(source.contactAddress), escapeHtml(source.contactPhone), gst?.buyerGstin && `GSTIN ${escapeHtml(gst.buyerGstin)}`)}
</div>
<div class="box">
<div class="label">${returnOf ? 'Settlement' : 'Payment'}</div>
${(returnOf ? lines(returnOf.settlement && escapeHtml(returnOf.settlement)) : lines(methods && escapeHtml(methods), balance != null && `Paid ${money(source.amountPaid ?? 0)} · Balance ${money(balance)}`, balance != null && balance > 0 && source.dueDate && `Due ${escapeHtml(formatDate(source.dueDate))}`)) || '<div class="muted">Not recorded</div>'}
</div>
</section>
<table class="items"><thead><tr>${itemHead.join('')}</tr></thead><tbody>${itemRows.join('')}</tbody></table>
${rateSummary}
${totals}
${source.note ? `<p class="note"><span class="label">Note</span><br>${escapeHtml(source.note)}</p>` : ''}
${returnOf?.reason ? `<p class="note"><span class="label">Reason</span><br>${escapeHtml(returnOf.reason)}</p>` : ''}
<footer class="footer">
<div class="muted">Computer-generated ${returnOf ? noteName(source.kind) : sale ? (taxInvoice ? 'tax invoice' : title === 'Bill of supply' ? 'bill of supply' : 'sale receipt') : 'purchase record'}.</div>
${sale || returnOf ? `<div class="sign">For ${escapeHtml(shop.name)}<div class="line">Authorised signatory</div></div>` : ''}
</footer>
</body>
</html>`;
}
