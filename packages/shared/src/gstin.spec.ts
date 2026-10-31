import { describe, expect, it } from 'vitest';

import { GST_STATES, gstinCheckCharacter, gstinStateCode, isGstStateCode, isValidGstin, normalizeGstin } from './gstin.js';

// Widely published valid GSTIN (Maharashtra).
const VALID = '27AAPFU0939F1ZV';

describe('isValidGstin', () => {
  it('accepts a valid GSTIN', () => {
    expect(isValidGstin(VALID)).toBe(true);
  });

  it('catches a mistyped character through the check digit', () => {
    expect(isValidGstin('27AAPFU0939F1ZW')).toBe(false);
    expect(isValidGstin('27AAPFU0939F2ZV')).toBe(false);
    expect(isValidGstin('27AAPFV0939F1ZV')).toBe(false);
  });

  it('rejects the wrong shape', () => {
    for (const value of ['', '27AAPFU0939F1Z', '27AAPFU0939F1ZVX', '27AAPFU0939F1YV', '2AAAPFU0939F1ZV', '27AAPFU0939F0ZV', '27aapfu0939f1zv']) {
      expect(isValidGstin(value)).toBe(false);
    }
  });

  it('rejects unknown state codes but accepts retired ones', () => {
    const withState = (state: string) => state + VALID.slice(2, 14) + gstinCheckCharacter(state + VALID.slice(2, 14));
    expect(isValidGstin(withState('00'))).toBe(false);
    expect(isValidGstin(withState('39'))).toBe(false);
    expect(isValidGstin(withState('33'))).toBe(true);
    expect(isValidGstin(withState('28'))).toBe(true);
  });
});

describe('normalizeGstin', () => {
  it('uppercases and removes spaces', () => {
    expect(normalizeGstin(' 27aapfu0939f1zv ')).toBe(VALID);
    expect(normalizeGstin('27 AAPFU 0939 F1ZV')).toBe(VALID);
  });
});

describe('gstinStateCode', () => {
  it('returns the registration state, mapping retired codes to current ones', () => {
    expect(gstinStateCode(VALID)).toBe('27');
    expect(gstinStateCode('28AAPFU0939F1ZV')).toBe('37');
    expect(gstinStateCode('25AAPFU0939F1ZV')).toBe('26');
  });
});

describe('GST_STATES', () => {
  it('lists current state codes with names', () => {
    expect(GST_STATES['27']).toBe('Maharashtra');
    expect(GST_STATES['07']).toBe('Delhi');
    expect(isGstStateCode('36')).toBe(true);
    expect(isGstStateCode('25')).toBe(false);
    expect(isGstStateCode('99')).toBe(false);
  });
});
