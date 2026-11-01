import { describe, expect, it } from 'vitest';

import { discardBillDialog, formSnapshot, hasUnsavedChanges } from './unsaved-changes';

describe('formSnapshot', () => {
  it('ignores the order fields were set in, at any depth', () => {
    expect(formSnapshot({ name: 'Glass', price: '90', photo: { a: 1, b: 2 } })).toBe(formSnapshot({ photo: { b: 2, a: 1 }, price: '90', name: 'Glass' }));
  });

  it('keeps list order, which is meaningful', () => {
    expect(formSnapshot({ options: ['Single', 'Pack'] })).not.toBe(formSnapshot({ options: ['Pack', 'Single'] }));
  });
});

describe('hasUnsavedChanges', () => {
  it('reports a change only after a baseline exists', () => {
    const baseline = formSnapshot({ name: 'Glass' });
    expect(hasUnsavedChanges(undefined, formSnapshot({ name: 'Edited' }))).toBe(false);
    expect(hasUnsavedChanges(baseline, formSnapshot({ name: 'Glass' }))).toBe(false);
    expect(hasUnsavedChanges(baseline, formSnapshot({ name: 'Glass 5mm' }))).toBe(true);
  });
});

describe('discardBillDialog', () => {
  it('names the contact, items and file that will be lost', () => {
    expect(discardBillDialog('sale', { contactName: 'Patil Constructions', itemCount: 3, hasFile: true })).toEqual({
      title: 'Discard this sale?',
      message: 'The customer Patil Constructions, 3 items and the reference photo will be removed. Nothing has been saved, and the draft on this device is deleted.',
      confirmLabel: 'Discard sale',
      cancelLabel: 'Keep editing',
    });
  });

  it('uses supplier wording for purchases and handles single parts', () => {
    expect(discardBillDialog('purchase', { contactName: 'Saint Glass', itemCount: 0 }).message).toBe('The supplier Saint Glass will be removed. Nothing has been saved, and the draft on this device is deleted.');
    expect(discardBillDialog('purchase', { itemCount: 1, hasFile: true }).message).toMatch(/^1 item and the attached bill will be removed\./);
    expect(discardBillDialog('purchase', { itemCount: 0 }).message).toMatch(/^This purchase will be removed\./);
    expect(discardBillDialog('purchase', { itemCount: 2 }).confirmLabel).toBe('Discard purchase');
  });
});
