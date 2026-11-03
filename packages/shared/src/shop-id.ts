// The unique shop ID (Business.slug) a new shop is created with. The apps fill
// it in from the business name; the API normalizes whatever it receives the
// same way, so older clients and replayed guest-shop moves keep working.

import { slugify } from './utils/strings.js';

export const SHOP_NAME_MAX = 120;
export const SHOP_ID_MIN = 2;
export const SHOP_ID_MAX = 80;
export const SHOP_ID_TAKEN_MESSAGE = 'This shop ID is already taken. Choose a different one.';
export const SHOP_ID_RULE_MESSAGE = 'Use at least 2 letters or numbers for the shop ID.';

/** slugify() capped at SHOP_ID_MAX, with no hyphen left at either end after the cut. */
export function shopIdFrom(value: string): string {
  return slugify(value).slice(0, SHOP_ID_MAX).replace(/^-+|-+$/g, '');
}

/** True when the name (trimmed) and the ID are both at least 2 characters. */
export function canCreateShop(input: { name: string; shopId: string }): boolean {
  return input.name.trim().length >= SHOP_ID_MIN && input.shopId.length >= SHOP_ID_MIN;
}
