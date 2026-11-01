import { describe, expect, it } from 'vitest';

import { pageTitle } from './page-title';

describe('pageTitle', () => {
  it('names tabs and fixed screens', () => {
    expect(pageTitle('/')).toBe('Overview · Invento');
    expect(pageTitle('/products')).toBe('Catalog · Invento');
    expect(pageTitle('/sale/quick')).toBe('New sale · Invento');
    expect(pageTitle('/settings/access/')).toBe('Team and roles · Invento');
    expect(pageTitle('/auth/login?next=%2Fsales')).toBe('Sign in · Invento');
  });

  it('names record pages by kind', () => {
    expect(pageTitle('/sale/abc123')).toBe('Sale · Invento');
    expect(pageTitle('/purchase/local_9f')).toBe('Purchase · Invento');
    expect(pageTitle('/product/11f09e76')).toBe('Product · Invento');
    expect(pageTitle('/people/customers/new')).toBe('New customer · Invento');
    expect(pageTitle('/people/suppliers/xyz')).toBe('Supplier · Invento');
  });

  it('falls back to the app name', () => {
    expect(pageTitle('/somewhere/else')).toBe('Invento');
    expect(pageTitle('')).toBe('Overview · Invento');
    expect(pageTitle('/modal')).toBe('Invento');
  });
});
