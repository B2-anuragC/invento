import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as shared from '@invento/shared';
import { describe, expect, it } from 'vitest';

import { registerError, signInError } from './auth-validation';

// The web panel and the phone must give the same answers, so the phone uses the
// rules from @invento/shared instead of its own copies.
const source = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

describe('mobile uses the shared account and shop rules', () => {
  it('re-exports the shared form checks', () => {
    expect(signInError).toBe(shared.signInError);
    expect(registerError).toBe(shared.registerError);
  });

  it('builds shop IDs with the shared helper', () => {
    const setup = source('app/business/setup.tsx');
    expect(setup).not.toMatch(/function toSlug/);
    expect(setup).toMatch(/shopIdFrom/);
    expect(setup).toMatch(/canCreateShop/);
  });

  it('shows the shared password hint on the register screen', () => {
    const register = source('app/auth/register.tsx');
    expect(register).toMatch(/PASSWORD_RULE_HINT/);
    expect(register).not.toContain(shared.PASSWORD_RULE_HINT);
  });
});
