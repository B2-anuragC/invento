import { CHARGE_GST_NEEDS_GSTIN_MESSAGE, HSN_RULE_MESSAGE } from '@invento/shared';
import { describe, expect, it } from 'vitest';

import { chargeGstSwitch, hsnCodeError, purchaseLineTax, purchaseRateNote, lineTaxText, provisionalSaleGst, receiptTitle, saleGstDetails, stateLabel, taxTotalRows } from './gst';

const SHOP_MH = '27AAPFU0939F1ZV';
const BUYER_KA = '29AAPFU0939F1ZR';
const intraState = { taxType: 'INTRA_STATE' as const, sellerGstin: SHOP_MH, sellerStateCode: '27', buyerGstin: null, placeOfSupply: '27' };

describe('saleGstDetails', () => {
  it('reads the details a sale was issued with', () => {
    expect(saleGstDetails({ ...intraState, buyerGstin: '' })).toEqual(intraState);
  });

  it('has none for sales made before GST invoices', () => {
    expect(saleGstDetails({ taxType: null })).toBeNull();
    expect(saleGstDetails({})).toBeNull();
  });
});

describe('provisionalSaleGst', () => {
  it('matches what the server copies when the bill syncs', () => {
    expect(provisionalSaleGst({ gstin: SHOP_MH, stateCode: '27' }, { gstin: BUYER_KA })).toEqual({ taxType: 'INTER_STATE', sellerGstin: SHOP_MH, sellerStateCode: '27', buyerGstin: BUYER_KA, placeOfSupply: '29' });
    expect(provisionalSaleGst({ gstin: SHOP_MH, stateCode: '27' }, { gstin: null })).toEqual(intraState);
  });

  it('treats blank or missing shop details as unregistered', () => {
    expect(provisionalSaleGst({ gstin: '', stateCode: '29' }, { gstin: '' })).toEqual({ taxType: 'UNREGISTERED', sellerGstin: null, sellerStateCode: '29', buyerGstin: null, placeOfSupply: '29' });
    expect(provisionalSaleGst(undefined, {})).toMatchObject({ taxType: 'UNREGISTERED', placeOfSupply: null });
  });
});

describe('receiptTitle', () => {
  it('titles numbered sales by the shop registration', () => {
    expect(receiptTitle('sale', intraState, 'INV/2026-27/0001')).toBe('Tax invoice');
    expect(receiptTitle('sale', { ...intraState, taxType: 'INTER_STATE' }, 'INV/2026-27/0001')).toBe('Tax invoice');
    expect(receiptTitle('sale', { ...intraState, taxType: 'UNREGISTERED', sellerGstin: null }, 'INV/2026-27/0001')).toBe('Bill of supply');
  });

  it('titles a numbered sale without GST a Bill of supply, with the same number', () => {
    expect(receiptTitle('sale', intraState, 'INV/2026-27/0001', false)).toBe('Bill of supply');
    expect(receiptTitle('sale', intraState, 'INV/2026-27/0001', true)).toBe('Tax invoice');
    expect(receiptTitle('sale', intraState, null, false)).toBe('Sale receipt');
    expect(receiptTitle('purchase', null, 'PUR/2026-27/0001', false)).toBe('Purchase receipt');
  });

  it('keeps unnumbered, older sales and purchases as receipts', () => {
    expect(receiptTitle('sale', intraState, null)).toBe('Sale receipt');
    expect(receiptTitle('sale', null, 'INV/2026-27/0001')).toBe('Sale receipt');
    expect(receiptTitle('purchase', null, 'PUR/2026-27/0001')).toBe('Purchase receipt');
  });
});

describe('tax text', () => {
  const line = { gstRate: '18', lineTotal: '180', taxAmount: '32.41' };

  it('splits a line into CGST and SGST at half the rate, with the odd paisa in CGST', () => {
    expect(lineTaxText(line, 'INTRA_STATE')).toBe('CGST 9% ₹16.21 · SGST 9% ₹16.20');
    expect(lineTaxText({ gstRate: '5', taxAmount: '2.5' }, 'INTRA_STATE')).toBe('CGST 2.5% ₹1.25 · SGST 2.5% ₹1.25');
  });

  it('shows IGST between states and a single GST figure otherwise', () => {
    expect(lineTaxText(line, 'INTER_STATE')).toBe('IGST 18% · ₹32.41');
    expect(lineTaxText(line, 'UNREGISTERED')).toBe('GST 18% · ₹32.41');
    expect(lineTaxText(line, undefined)).toBe('GST 18% · ₹32.41');
  });

  it('totals each tax head so the rows add up to the bill tax', () => {
    const lines = [line, { gstRate: '18', lineTotal: '0.25', taxAmount: '0.05' }, { gstRate: '5', lineTotal: '100', taxAmount: '5' }];
    expect(taxTotalRows(lines, 'INTRA_STATE', '37.46')).toEqual([{ key: 'cgst', label: 'CGST', amount: 18.74 }, { key: 'sgst', label: 'SGST', amount: 18.72 }]);
    expect(taxTotalRows(lines, 'INTER_STATE', '37.46')).toEqual([{ key: 'igst', label: 'IGST', amount: 37.46 }]);
    expect(taxTotalRows(lines, undefined, '37.46')).toEqual([{ key: 'gst', label: 'GST', amount: 37.46 }]);
    expect(taxTotalRows(lines, 'INTRA_STATE', '37.46', true)).toHaveLength(2);
  });

  it('has no tax rows for a bill without GST', () => {
    expect(taxTotalRows([{ gstRate: '0', lineTotal: '100', taxAmount: '0' }], 'INTRA_STATE', '0', false)).toEqual([]);
    expect(taxTotalRows([], undefined, '0', false)).toEqual([]);
  });
});

describe('chargeGstSwitch', () => {
  it('needs the shop GSTIN to charge GST on a sale and explains why', () => {
    expect(chargeGstSwitch('sale', false, { gstin: null })).toEqual({ disabled: true, note: CHARGE_GST_NEEDS_GSTIN_MESSAGE });
    expect(chargeGstSwitch('sale', true, { gstin: '' }).disabled).toBe(true);
    expect(chargeGstSwitch('sale', false, { gstin: SHOP_MH })).toEqual({ disabled: false, note: 'Bill of supply · no GST on any item.' });
    expect(chargeGstSwitch('sale', true, { gstin: SHOP_MH })).toEqual({ disabled: false, note: 'Tax invoice · GST at each item’s rate.' });
  });

  it('stays usable while shop details are unknown, and for purchases', () => {
    expect(chargeGstSwitch('sale', true, null).disabled).toBe(false);
    expect(chargeGstSwitch('purchase', true, { gstin: null })).toEqual({ disabled: false, note: 'GST at each item’s rate, as on the supplier’s bill.' });
    expect(chargeGstSwitch('purchase', false, null).note).toBe('No GST on this purchase.');
  });
});

describe('helpers', () => {
  it('names states with their code', () => {
    expect(stateLabel('29')).toBe('Karnataka (29)');
    expect(stateLabel(null)).toBe('');
    expect(stateLabel('99')).toBe('99');
  });

  it('checks HSN codes before saving', () => {
    expect(hsnCodeError('')).toBe('');
    expect(hsnCodeError(' 7005 29 ')).toBe('');
    expect(hsnCodeError('70052')).toBe(HSN_RULE_MESSAGE);
  });
});

describe('purchase quantities and GST', () => {
  const money = (value: string | null) => value?.replace(/ /g, ' ');
  it('says rates are before GST, and whether GST is added', () => {
    expect(purchaseRateNote(true)).toBe('Enter buy rates before GST, as on the supplier’s bill. GST is added at each item’s rate.');
    expect(purchaseRateNote(false)).toContain('No GST is added');
    expect(purchaseRateNote(false)).toContain('“Supplier charged GST” at Review');
  });
  it('shows each line’s GST, rounded half up to the paisa, only while GST is charged', () => {
    expect(money(purchaseLineTax(3, 333.33, '18.00', true))).toBe('GST 18% · ₹180.00 · With GST ₹1,179.99');
    expect(money(purchaseLineTax(1, 0.1, 5, true))).toBe('GST 5% · ₹0.01 · With GST ₹0.11');
    expect(purchaseLineTax(2, 100, '0.00', true)).toBe('No GST on this item (0%)');
    expect(purchaseLineTax(2, 100, undefined, true)).toBe('No GST on this item (0%)');
    expect(purchaseLineTax(2, 100, '18', false)).toBeNull();
  });
});
