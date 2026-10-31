import { describe, expect, it } from 'vitest';

import { transactionSaveLabel } from './save-label';

const base = { saving: false, outcome: null, savingLabel: 'Saving purchase…', saveLabel: 'Save purchase · ₹849.60' } as const;

describe('transactionSaveLabel', () => {
  it('shows the normal save label for a new or rejected save', () => {
    expect(transactionSaveLabel(base)).toBe('Save purchase · ₹849.60');
    expect(transactionSaveLabel({ ...base, outcome: 'rejected' })).toBe('Save purchase · ₹849.60');
  });

  it('offers a safe retry only when the previous save could not be confirmed', () => {
    expect(transactionSaveLabel({ ...base, outcome: 'unknown' })).toBe('Retry the same save safely');
  });

  it('prefers a busy file or photo, then saving, over any outcome', () => {
    expect(transactionSaveLabel({ ...base, saving: true, outcome: 'unknown' })).toBe('Saving purchase…');
    expect(transactionSaveLabel({ ...base, busy: 'Preparing file…', saving: true })).toBe('Preparing file…');
  });
});
