import { describe, expect, it } from 'vitest';

import { canCreateShop, SHOP_ID_MAX, shopIdFrom } from './shop-id.js';

describe('shopIdFrom', () => {
  it.each([
    ['Shree Aluminium & Hardware', 'shree-aluminium-hardware'],
    ['  My Shop!  ', 'my-shop'],
    ['Café Ñandú', 'cafe-nandu'],
    ['---a--b---', 'a-b'],
    ['!!!', ''],
    ['', ''],
    ['   ', ''],
    ['shree-aluminium', 'shree-aluminium'],
    ['दुकान 24', '24'],
  ])('%j → %j', (input, expected) => expect(shopIdFrom(input)).toBe(expected));

  it('gives the same result when run twice', () => {
    const once = shopIdFrom('Shree Aluminium & Hardware');
    expect(shopIdFrom(once)).toBe(once);
  });

  it('caps at the maximum without leaving a trailing hyphen', () => {
    const id = shopIdFrom('a'.repeat(79) + ' b');
    expect(id.length).toBeLessThanOrEqual(SHOP_ID_MAX);
    expect(id.endsWith('-')).toBe(false);
    expect(shopIdFrom('x'.repeat(200))).toHaveLength(SHOP_ID_MAX);
  });
});

describe('canCreateShop', () => {
  it('needs a 2+ character name and shop ID', () => {
    expect(canCreateShop({ name: 'AB', shopId: 'ab' })).toBe(true);
    expect(canCreateShop({ name: ' A ', shopId: 'ab' })).toBe(false);
    expect(canCreateShop({ name: 'AB', shopId: 'a' })).toBe(false);
    expect(canCreateShop({ name: 'AB', shopId: '' })).toBe(false);
  });
});
