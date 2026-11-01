import { CHARGE_GST_NEEDS_GSTIN_MESSAGE, chargesGst, GST_STATES, gstRateSummary, halfRate, HSN_RULE_MESSAGE, invoiceTaxContext, isValidHsnCode, normalizeHsnCode, saleDocumentTitle, splitLineTax, type GstTaxType } from '@invento/shared';

import { formatMoney } from './format';
import { transactionTotals } from './transaction-accounting';

/** GST details a sale was issued with. Purchases and sales made before GST invoices have none. */
export type SaleGstDetails = { taxType: GstTaxType; sellerGstin: string | null; sellerStateCode: string | null; buyerGstin: string | null; placeOfSupply: string | null };

type GstFields = { taxType?: GstTaxType | null; sellerGstin?: string | null; sellerStateCode?: string | null; buyerGstin?: string | null; placeOfSupply?: string | null };
type TaxedLine = { gstRate?: string | number; taxAmount?: string | number; lineTotal?: string | number };

export function saleGstDetails(sale: GstFields): SaleGstDetails | null {
  if (!sale.taxType) return null;
  return { taxType: sale.taxType, sellerGstin: sale.sellerGstin || null, sellerStateCode: sale.sellerStateCode || null, buyerGstin: sale.buyerGstin || null, placeOfSupply: sale.placeOfSupply || null };
}

/** The details the server copies onto a sale, for a bill still waiting on this device. */
export function provisionalSaleGst(shop: { gstin?: string | null; stateCode?: string | null } | undefined, customer: { gstin?: string | null }): SaleGstDetails {
  const sellerGstin = shop?.gstin || null;
  const buyerGstin = customer.gstin || null;
  return { sellerGstin, buyerGstin, ...invoiceTaxContext({ sellerGstin, sellerStateCode: shop?.stateCode, buyerGstin }) };
}

/**
 * A tax invoice needs its number, so a bill waiting to sync stays a receipt. A
 * numbered sale without GST, or from a shop without a GSTIN, is a Bill of supply.
 */
export function receiptTitle(kind: 'sale' | 'purchase', gst: SaleGstDetails | null | undefined, documentNumber: string | null | undefined, chargeGst?: boolean | null): string {
  if (kind === 'purchase') return 'Purchase receipt';
  if (!gst || !documentNumber) return 'Sale receipt';
  return saleDocumentTitle({ chargeGst, taxType: gst.taxType }) ?? 'Sale receipt';
}

export type ChargeGstSwitch = { disabled: boolean; note: string };

/**
 * The "Charge GST" switch on a new bill (off by default). Sales need the shop
 * GSTIN; until the shop details load the switch stays usable and the server
 * checks it. Purchases follow whatever the supplier's bill shows.
 */
export function chargeGstSwitch(kind: 'sale' | 'purchase', on: boolean, shop: { gstin?: string | null } | null | undefined): ChargeGstSwitch {
  if (kind === 'purchase') return { disabled: false, note: on ? 'GST at each item’s rate, as on the supplier’s bill.' : 'No GST on this purchase.' };
  if (shop && !shop.gstin) return { disabled: true, note: CHARGE_GST_NEEDS_GSTIN_MESSAGE };
  return { disabled: false, note: on ? 'Tax invoice · GST at each item’s rate.' : 'Bill of supply · no GST on any item.' };
}

/**
 * The note above a purchase's quantities and buy rates. Rates are always
 * before GST: with "Supplier charged GST" on, GST is added at each item's
 * rate; with it off (the default) nothing is added.
 */
export function purchaseRateNote(chargeGst: boolean): string {
  return chargeGst
    ? 'Enter buy rates before GST, as on the supplier’s bill. GST is added at each item’s rate.'
    : 'Enter buy rates as on the supplier’s bill. No GST is added: if the bill charges GST, turn on “Supplier charged GST” at Review and enter rates before GST.';
}

/** A purchase line's GST while "Supplier charged GST" is on, worked out as the bill total does; null while it is off. */
export function purchaseLineTax(quantity: number, price: number, gstRate: string | number | null | undefined, chargeGst: boolean): string | null {
  if (!chargeGst) return null;
  const rate = Number(gstRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return 'No GST on this item (0%)';
  const { tax, total } = transactionTotals([{ quantity, price, product: { gstRate: rate } }], {}, true);
  return `GST ${rate}% · ${formatMoney(tax)} · With GST ${formatMoney(total)}`;
}

export function stateLabel(code: string | null | undefined): string {
  if (!code) return '';
  return GST_STATES[code] ? `${GST_STATES[code]} (${code})` : code;
}

/** One line's tax: CGST and SGST at half the rate each, IGST, or a single GST figure. */
export function lineTaxText(line: TaxedLine, taxType: GstTaxType | undefined): string {
  const rate = Number(line.gstRate ?? 0);
  if (taxType === 'INTRA_STATE') {
    const split = splitLineTax(line.taxAmount ?? 0, taxType);
    return `CGST ${halfRate(rate)}% ${formatMoney(split.cgst)} · SGST ${halfRate(rate)}% ${formatMoney(split.sgst)}`;
  }
  return `${taxType === 'INTER_STATE' ? 'IGST' : 'GST'} ${rate}% · ${formatMoney(Number(line.taxAmount ?? 0))}`;
}

export type TaxRow = { key: 'cgst' | 'sgst' | 'igst' | 'gst'; label: string; amount: number };

/** Tax rows for the bill totals. They always add up to the stored tax total; a bill without GST has none. */
export function taxTotalRows(lines: TaxedLine[], taxType: GstTaxType | undefined, taxTotal: string | number, chargeGst?: boolean | null): TaxRow[] {
  if (!chargesGst(chargeGst)) return [];
  if (taxType !== 'INTRA_STATE' && taxType !== 'INTER_STATE') return [{ key: 'gst', label: 'GST', amount: Number(taxTotal) }];
  const summary = gstRateSummary(lines.map((line) => ({ gstRate: line.gstRate ?? 0, lineTotal: line.lineTotal ?? 0, taxAmount: line.taxAmount ?? 0 })), taxType);
  const sum = (key: 'cgst' | 'sgst' | 'igst') => summary.reduce((total, row) => total + Math.round(row[key] * 100), 0) / 100;
  return taxType === 'INTRA_STATE'
    ? [{ key: 'cgst', label: 'CGST', amount: sum('cgst') }, { key: 'sgst', label: 'SGST', amount: sum('sgst') }]
    : [{ key: 'igst', label: 'IGST', amount: sum('igst') }];
}

/** Empty when blank (clears the code) or valid; checked before an offline save so it cannot fail later during sync. */
export function hsnCodeError(value: string): string {
  const normalized = normalizeHsnCode(value);
  return normalized === '' || isValidHsnCode(normalized) ? '' : HSN_RULE_MESSAGE;
}
