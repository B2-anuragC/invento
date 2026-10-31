import { PHONE_RULE_MESSAGE } from '@invento/shared';
import { describe, expect, it } from 'vitest';

import { phoneError } from './contact-validation';

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
