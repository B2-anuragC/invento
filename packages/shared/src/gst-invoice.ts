// GST details of an invoice (CGST Rule 46): which tax heads apply and how each
// line's tax divides between them. Bill totals never change: the split only
// divides the tax amount already stored on each line.

import { gstinStateCode } from './gstin.js';

/** INTRA_STATE: CGST + SGST. INTER_STATE: IGST. UNREGISTERED: the shop has no GSTIN (bill of supply). */
export type GstTaxType = 'INTRA_STATE' | 'INTER_STATE' | 'UNREGISTERED';

export type InvoiceTaxContext = { sellerStateCode: string | null; placeOfSupply: string | null; taxType: GstTaxType };

export const HSN_RULE_MESSAGE = 'Enter a 4, 6 or 8-digit HSN code.';

/** HSN code as stored: digits only, so "7005 29" and "700529" are the same code. */
export function normalizeHsnCode(value: string): string {
  return value.replace(/\s+/g, '');
}

export function isValidHsnCode(value: string): boolean {
  return /^(\d{4}|\d{6}|\d{8})$/.test(value);
}

/**
 * Place of supply and tax type when a sale is created. A registered customer's
 * GSTIN gives the place of supply; otherwise it is the shop's own state
 * (an over-the-counter supply). Different states mean IGST.
 */
export function invoiceTaxContext(input: { sellerGstin?: string | null; sellerStateCode?: string | null; buyerGstin?: string | null }): InvoiceTaxContext {
  const sellerStateCode = input.sellerGstin ? gstinStateCode(input.sellerGstin) : input.sellerStateCode || null;
  const placeOfSupply = input.buyerGstin ? gstinStateCode(input.buyerGstin) : sellerStateCode;
  if (!input.sellerGstin) return { sellerStateCode, placeOfSupply, taxType: 'UNREGISTERED' };
  return { sellerStateCode, placeOfSupply, taxType: placeOfSupply && sellerStateCode && placeOfSupply !== sellerStateCode ? 'INTER_STATE' : 'INTRA_STATE' };
}

export type GstLineSplit = { cgst: number; sgst: number; igst: number };

const toPaise = (value: number | string) => Math.round(Number(value) * 100);

/**
 * Divides one line's stored tax. CGST takes half rounded half-up to the paisa
 * and SGST the rest, so CGST + SGST always equals the stored tax.
 */
export function splitLineTax(taxAmount: number | string, taxType: GstTaxType): GstLineSplit {
  const paise = toPaise(taxAmount);
  if (taxType === 'INTER_STATE') return { cgst: 0, sgst: 0, igst: paise / 100 };
  if (taxType === 'UNREGISTERED') return { cgst: 0, sgst: 0, igst: 0 };
  const cgst = Math.ceil(paise / 2);
  return { cgst: cgst / 100, sgst: (paise - cgst) / 100, igst: 0 };
}

export type GstRateSummary = { rate: number; taxableValue: number; cgst: number; sgst: number; igst: number };

/** Tax by rate for the invoice footer, from each line's stored amounts; the taxable value is net of any discount. */
export function gstRateSummary(lines: { gstRate: number | string; lineTotal: number | string; taxAmount: number | string; discountAmount?: number | string }[], taxType: GstTaxType): GstRateSummary[] {
  const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const line of lines) {
    const rate = Number(line.gstRate);
    const split = splitLineTax(line.taxAmount, taxType);
    const entry = byRate.get(rate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    entry.taxable += toPaise(line.lineTotal) - toPaise(line.discountAmount ?? 0);
    entry.cgst += toPaise(split.cgst);
    entry.sgst += toPaise(split.sgst);
    entry.igst += toPaise(split.igst);
    byRate.set(rate, entry);
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, entry]) => ({ rate, taxableValue: entry.taxable / 100, cgst: entry.cgst / 100, sgst: entry.sgst / 100, igst: entry.igst / 100 }));
}

/** Half of a GST rate for display, e.g. 18 -> "9", 5 -> "2.5", 0.25 -> "0.125". */
export function halfRate(rate: number | string): string {
  return String(Number((Number(rate) / 2).toFixed(3)));
}
