import { describe, expect, it } from 'vitest';

import { gstRateSummary, halfRate, invoiceTaxContext, isValidHsnCode, normalizeHsnCode, splitLineTax } from './gst-invoice.js';

const SHOP_MH = '27AAPFU0939F1ZV';
// Built from the same PAN with valid check characters.
const BUYER_KA = '29AAPFU0939F1ZR';
const RETIRED_AP = '28AAPFU0939F1ZT';

describe('invoiceTaxContext', () => {
  it('uses CGST + SGST for a counter sale or a customer in the same state', () => {
    expect(invoiceTaxContext({ sellerGstin: SHOP_MH, sellerStateCode: '27' })).toEqual({ sellerStateCode: '27', placeOfSupply: '27', taxType: 'INTRA_STATE' });
    expect(invoiceTaxContext({ sellerGstin: SHOP_MH, sellerStateCode: '27', buyerGstin: SHOP_MH })).toEqual({ sellerStateCode: '27', placeOfSupply: '27', taxType: 'INTRA_STATE' });
  });

  it("uses IGST when a registered customer is in another state", () => {
    expect(invoiceTaxContext({ sellerGstin: SHOP_MH, sellerStateCode: '27', buyerGstin: BUYER_KA })).toEqual({ sellerStateCode: '27', placeOfSupply: '29', taxType: 'INTER_STATE' });
  });

  it("takes the shop's state from its GSTIN, mapping retired state codes", () => {
    expect(invoiceTaxContext({ sellerGstin: SHOP_MH, sellerStateCode: null, buyerGstin: BUYER_KA })).toEqual({ sellerStateCode: '27', placeOfSupply: '29', taxType: 'INTER_STATE' });
    // 28 was Andhra Pradesh before 2014; its registrations now belong to 37.
    expect(invoiceTaxContext({ sellerGstin: RETIRED_AP, sellerStateCode: '37' })).toEqual({ sellerStateCode: '37', placeOfSupply: '37', taxType: 'INTRA_STATE' });
  });

  it('marks a shop without a GSTIN as unregistered (bill of supply)', () => {
    expect(invoiceTaxContext({ sellerGstin: null, sellerStateCode: '29' })).toEqual({ sellerStateCode: '29', placeOfSupply: '29', taxType: 'UNREGISTERED' });
    expect(invoiceTaxContext({ sellerGstin: null, sellerStateCode: '29', buyerGstin: SHOP_MH })).toEqual({ sellerStateCode: '29', placeOfSupply: '27', taxType: 'UNREGISTERED' });
    expect(invoiceTaxContext({})).toEqual({ sellerStateCode: null, placeOfSupply: null, taxType: 'UNREGISTERED' });
  });
});

describe('splitLineTax', () => {
  it('halves the stored tax and gives an odd paisa to CGST', () => {
    expect(splitLineTax('324.00', 'INTRA_STATE')).toEqual({ cgst: 162, sgst: 162, igst: 0 });
    expect(splitLineTax('0.05', 'INTRA_STATE')).toEqual({ cgst: 0.03, sgst: 0.02, igst: 0 });
    expect(splitLineTax(6.89, 'INTRA_STATE')).toEqual({ cgst: 3.45, sgst: 3.44, igst: 0 });
  });

  it('always adds back to the stored tax', () => {
    for (const tax of ['0.01', '0.05', '6.89', '21.60', '306.00', '1234.57']) {
      const split = splitLineTax(tax, 'INTRA_STATE');
      expect(Math.round((split.cgst + split.sgst) * 100)).toBe(Math.round(Number(tax) * 100));
    }
  });

  it('puts the whole tax in IGST between states, and none for an unregistered shop', () => {
    expect(splitLineTax('324.00', 'INTER_STATE')).toEqual({ cgst: 0, sgst: 0, igst: 324 });
    expect(splitLineTax('324.00', 'UNREGISTERED')).toEqual({ cgst: 0, sgst: 0, igst: 0 });
  });
});

describe('gstRateSummary', () => {
  const lines = [
    { gstRate: '18', lineTotal: '1800.00', taxAmount: '324.00' },
    { gstRate: '18', lineTotal: '180.00', taxAmount: '32.40' },
    { gstRate: '5', lineTotal: '0.25', taxAmount: '0.01' },
  ];

  it('groups taxable value and tax by rate', () => {
    expect(gstRateSummary(lines, 'INTRA_STATE')).toEqual([
      { rate: 5, taxableValue: 0.25, cgst: 0.01, sgst: 0, igst: 0 },
      { rate: 18, taxableValue: 1980, cgst: 178.2, sgst: 178.2, igst: 0 },
    ]);
    expect(gstRateSummary(lines, 'INTER_STATE')[1]).toEqual({ rate: 18, taxableValue: 1980, cgst: 0, sgst: 0, igst: 356.4 });
  });
});

describe('helpers', () => {
  it('formats half rates', () => {
    expect([halfRate(18), halfRate('5'), halfRate(0.25), halfRate(28)]).toEqual(['9', '2.5', '0.125', '14']);
  });

  it('accepts 4, 6 or 8-digit HSN codes', () => {
    for (const code of ['7005', '700529', '70052910']) expect(isValidHsnCode(code)).toBe(true);
    for (const code of ['', '700', '70052', '7005291', '700529101', '70A5']) expect(isValidHsnCode(code)).toBe(false);
    expect(normalizeHsnCode(' 7005 29 ')).toBe('700529');
  });
});
