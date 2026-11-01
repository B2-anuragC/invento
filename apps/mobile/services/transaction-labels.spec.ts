import { describe, expect, it } from 'vitest';

import { receiptIdentity, transactionNumber, transactionReference, transactionSearchText, transactionTitle } from './transaction-labels';

const numberedSale = { id: 'cmvvx0oy7000zc2iacr64irw9', documentNumber: 'INV/2026-27/0001', invoiceNumber: 'REF-9' };
const olderSale = { id: 'cmvvx0oy7000zc2iacr64irw9', documentNumber: null, invoiceNumber: null };
const numberedPurchase = { id: 'cmvvzyli3000taa7bskex1pr9', documentNumber: 'PUR/2026-27/0003', invoiceNumber: 'SUP-77' };

describe('transactionTitle and transactionNumber', () => {
  it('prefer the system invoice number', () => {
    expect(transactionTitle('sale', numberedSale)).toBe('INV/2026-27/0001');
    expect(transactionNumber('purchase', numberedPurchase)).toBe('PUR/2026-27/0003');
  });

  it('keep the old labels for bills saved before numbering', () => {
    expect(transactionTitle('sale', olderSale)).toBe('Sale CR64IRW9');
    expect(transactionTitle('sale', { ...olderSale, invoiceNumber: 'LOCAL-000001' })).toBe('LOCAL-000001');
    expect(transactionNumber('sale', olderSale)).toBe('CR64IRW9');
  });

  it("never title a purchase with the supplier's number", () => {
    expect(transactionTitle('purchase', { ...numberedPurchase, documentNumber: null })).toBe('Purchase SKEX1PR9');
  });
});

describe('transactionReference', () => {
  it("shows the typed sale reference and the supplier's invoice number", () => {
    expect(transactionReference('sale', numberedSale)).toBe('Reference REF-9');
    expect(transactionReference('purchase', numberedPurchase)).toBe('Supplier invoice SUP-77');
  });

  it('is empty when the reference is already the title or missing', () => {
    expect(transactionReference('sale', { ...olderSale, invoiceNumber: 'INV-001' })).toBe('');
    expect(transactionReference('purchase', { ...numberedPurchase, invoiceNumber: null })).toBe('');
  });
});

describe('transactionSearchText', () => {
  it('matches names and every number', () => {
    const text = transactionSearchText({ ...numberedPurchase, name: 'Saint Glass' });
    for (const query of ['saint', 'pur/2026-27/0003', '0003', 'sup-77', 'skex1pr9']) expect(text).toContain(query);
  });

  it('finds a bill by its credit or debit note number', () => {
    expect(transactionSearchText({ ...numberedPurchase, returns: [{ documentNumber: 'DN/2026-27/0001' }] })).toContain('dn/2026-27/0001');
  });
});

describe('receiptIdentity', () => {
  it('shows a provisional reference until the bill syncs and gets its number', () => {
    expect(receiptIdentity('sale', { id: 'local_req_m9fnjt13', syncState: 'pending' })).toEqual({
      caption: 'PROVISIONAL DEVICE REFERENCE',
      value: 'Device bill · M9FNJT13',
      note: 'The invoice number is assigned when this bill syncs.',
    });
    expect(receiptIdentity('purchase', { id: 'local_req_m9fnjt13', syncState: 'conflict' }).note).toBe('The purchase number is assigned when this bill syncs.');
  });

  it('shows the invoice or purchase number once assigned', () => {
    expect(receiptIdentity('sale', numberedSale)).toEqual({ caption: 'INVOICE NUMBER', value: 'INV/2026-27/0001', note: 'Reference REF-9' });
    expect(receiptIdentity('purchase', numberedPurchase)).toEqual({ caption: 'PURCHASE NUMBER', value: 'PUR/2026-27/0003', note: 'Supplier invoice SUP-77' });
  });

  it('keeps the previous identity for bills saved before numbering', () => {
    expect(receiptIdentity('sale', olderSale)).toEqual({ caption: 'INVOICE / TRANSACTION IDENTIFIER', value: olderSale.id });
    expect(receiptIdentity('purchase', { ...numberedPurchase, documentNumber: null })).toEqual({ caption: 'INTERNAL PURCHASE IDENTIFIER', value: numberedPurchase.id, note: 'Supplier invoice SUP-77' });
  });
});
