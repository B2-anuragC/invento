import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from './api';
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { storage.set(key, value); },
} }));
import { readProductFavorites, saveProductFavorites } from './product-favorites';
const session = { user: { id: 'user-a' }, businessId: 'shop-a' } as AppSession;
describe('saved product favorites', () => {
  beforeEach(() => storage.clear());
  it('persists selections and isolates users and businesses', async () => {
    await saveProductFavorites(session, { product1: true, product2: false });
    expect(await readProductFavorites(session)).toEqual({ product1: true });
    expect(await readProductFavorites({ ...session, businessId: 'shop-b' })).toEqual({});
    expect(await readProductFavorites({ ...session, user: { ...session.user, id: 'user-b' } })).toEqual({});
  });
  it('ignores invalid selection values in storage', async () => {
    await saveProductFavorites(session, { product1: true });
    const key = [...storage.keys()][0];
    storage.set(key, JSON.stringify({ product1: true, product2: 'true', product3: 1 }));
    expect(await readProductFavorites(session)).toEqual({ product1: true });
  });
});
