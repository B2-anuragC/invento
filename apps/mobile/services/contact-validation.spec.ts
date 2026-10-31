import { GSTIN_RULE_MESSAGE, PHONE_RULE_MESSAGE } from '@invento/shared';
import { describe, expect, it } from 'vitest';

import { gstinError, gstinInput, phoneError } from './contact-validation';

describe('phoneError', () => {
  it('allows a blank phone, which clears the number', () => {
    expect(phoneError('')).toBe('');
    expect(phoneError('   ')).toBe('');
  });

  it('allows valid numbers', () => {
    expect(phoneError('+91 98765 43210')).toBe('');
    expect(phoneError('9876543210')).toBe('');
  });

  it('explains the rule for invalid numbers', () => {
    expect(phoneError('abc12')).toBe(PHONE_RULE_MESSAGE);
    expect(phoneError('12345')).toBe(PHONE_RULE_MESSAGE);
  });
});

describe('gstinError', () => {
  it('allows blank and valid GSTINs in any case or spacing', () => {
    expect(gstinError('')).toBe('');
    expect(gstinError('27AAPFU0939F1ZV')).toBe('');
    expect(gstinError(' 27aapfu 0939f1zv ')).toBe('');
  });

  it('explains the rule for a mistyped GSTIN', () => {
    expect(gstinError('27AAPFU0939F1ZW')).toBe(GSTIN_RULE_MESSAGE);
    expect(gstinError('GSTIN')).toBe(GSTIN_RULE_MESSAGE);
  });

  it('sends the GSTIN normalised, and blank to clear it', () => {
    expect(gstinInput(' 27aapfu 0939f1zv ')).toBe('27AAPFU0939F1ZV');
    expect(gstinInput('   ')).toBe('');
  });
});
