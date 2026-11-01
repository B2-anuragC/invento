import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from './api';
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { storage.set(key, value); },
} }));
import { placeFirst, productInitials, readCatalogView, saveCatalogView, stockBadge } from './catalog-view';
const session = { user: { id: 'user-a' }, businessId: 'shop-a' } as AppSession;

describe('remembered catalog view', () => {
  beforeEach(() => storage.clear());
  it('defaults to the list and remembers tiles per person and shop', async () => {
    expect(await readCatalogView(session)).toBe('list');
    await saveCatalogView(session, 'grid');
    expect(await readCatalogView(session)).toBe('grid');
    expect(await readCatalogView({ ...session, businessId: 'shop-b' })).toBe('list');
    expect(await readCatalogView({ ...session, user: { ...session.user, id: 'user-b' } })).toBe('list');
  });
  it('ignores an unknown stored value', async () => {
    await saveCatalogView(session, 'grid');
    storage.set([...storage.keys()][0], 'tiles');
    expect(await readCatalogView(session)).toBe('list');
  });
});

describe('catalog tiles', () => {
  it('labels stock as available, low or out of stock', () => {
    expect(stockBadge(0, 5)).toEqual({ tone: 'out', label: 'Out of stock' });
    expect(stockBadge(-2, 0)).toEqual({ tone: 'out', label: 'Out of stock' });
    expect(stockBadge(3, 5)).toEqual({ tone: 'low', label: 'Low stock' });
    expect(stockBadge(5, 5)).toEqual({ tone: 'available', label: 'Available' });
    expect(stockBadge(0.5, 0)).toEqual({ tone: 'available', label: 'Available' });
  });
  it('makes up to two initials from the name', () => {
    expect(productInitials('Clear Float Glass 5mm')).toBe('CF');
    expect(productInitials('  aluminium  ')).toBe('A');
    expect(productInitials('5mm (toughened) glass')).toBe('5T');
    expect(productInitials('— ')).toBe('?');
  });
  it('moves the added product to the front and leaves the rest in order', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(placeFirst(items, 'c').map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(placeFirst(items, 'a')).toBe(items);
    expect(placeFirst(items, 'missing')).toBe(items);
    expect(placeFirst(items, null)).toBe(items);
  });
});
