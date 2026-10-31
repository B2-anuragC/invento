import { describe, expect, it } from 'vitest';

import { shopDetailsErrors, shopDetailsInput, stateFromGstin, type ShopDetailsForm } from './shop-details';

const form = (patch: Partial<ShopDetailsForm> = {}): ShopDetailsForm => ({
  name: 'QA Glass & Hardware', phone: '+91 98765 43210', email: '', address: 'Shop 12, Station Road, Pune', gstin: '', stateCode: '', invoicePrefix: 'INV', purchasePrefix: 'PUR', ...patch,
});

describe('shopDetailsErrors', () => {
  it('accepts an unregistered shop with only the basics', () => {
    expect(shopDetailsErrors(form())).toEqual({});
    expect(shopDetailsErrors(form({ stateCode: '29' }))).toEqual({});
  });

  it('accepts a registered shop whose state matches its GSTIN', () => {
    expect(shopDetailsErrors(form({ gstin: '27aapfu0939f1zv', stateCode: '27' }))).toEqual({});
  });

  it('reports each problem on its own field', () => {
    expect(shopDetailsErrors(form({ name: ' ', phone: 'abc', email: 'shop@', gstin: '27AAPFU0939F1ZW', invoicePrefix: 'INVO', purchasePrefix: '' }))).toEqual({
      name: 'Enter the shop name (at least 2 characters).',
      phone: expect.stringContaining('phone number'),
      email: 'Enter a valid email address.',
      gstin: expect.stringContaining('GSTIN'),
      invoicePrefix: expect.stringContaining('prefix'),
      purchasePrefix: expect.stringContaining('prefix'),
    });
  });

  it("lets the GSTIN's state replace an earlier state choice", () => {
    // Clearing the GSTIN, choosing Karnataka, then entering a Maharashtra GSTIN.
    const changed = form({ gstin: '27AAPFU0939F1ZV', stateCode: '29' });
    expect(shopDetailsErrors(changed)).toEqual({});
    expect(shopDetailsInput(changed).stateCode).toBe('27');
  });

  it('rejects an unknown state for an unregistered shop', () => {
    expect(shopDetailsErrors(form({ stateCode: '39' })).stateCode).toBe('Choose a valid state.');
  });
});

describe('shopDetailsInput', () => {
  it('normalises values and takes the state from the GSTIN', () => {
    expect(shopDetailsInput(form({ name: ' Shop ', gstin: '27 aapfu0939f1zv', stateCode: '', invoicePrefix: 'gs', purchasePrefix: 'p1' }))).toEqual({
      name: 'Shop', phone: '+91 98765 43210', email: '', address: 'Shop 12, Station Road, Pune', gstin: '27AAPFU0939F1ZV', stateCode: '27', invoicePrefix: 'GS', purchasePrefix: 'P1',
    });
  });

  it('keeps the chosen state for an unregistered shop and sends blanks to clear', () => {
    expect(shopDetailsInput(form({ gstin: ' ', stateCode: '29' }))).toMatchObject({ gstin: '', stateCode: '29' });
  });
});

describe('stateFromGstin', () => {
  it('is empty until the GSTIN is valid', () => {
    expect(stateFromGstin('27AAPFU0939F1ZV')).toBe('27');
    expect(stateFromGstin('27AAPFU')).toBe('');
  });
});
