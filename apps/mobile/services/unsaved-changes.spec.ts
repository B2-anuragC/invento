import { describe, expect, it } from 'vitest';

import { formSnapshot, hasUnsavedChanges } from './unsaved-changes';

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
