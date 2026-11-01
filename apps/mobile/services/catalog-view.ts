import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSession } from './api';

export type CatalogView = 'list' | 'grid';
export type StockBadge = { tone: 'available' | 'low' | 'out'; label: string };

// The catalog remembers list or tile view per person and shop.
const key = (session: AppSession) => `invento.catalog-view.v1.${session.user.id}.${session.businessId}`;

export async function readCatalogView(session: AppSession): Promise<CatalogView> {
  return (await AsyncStorage.getItem(key(session))) === 'grid' ? 'grid' : 'list';
}

export async function saveCatalogView(session: AppSession, view: CatalogView): Promise<void> {
  await AsyncStorage.setItem(key(session), view);
}

/** Stock badge on a catalog tile: out of stock at zero or below, low under the minimum level. */
export function stockBadge(quantity: number, minimumStock: number): StockBadge {
  if (quantity <= 0) return { tone: 'out', label: 'Out of stock' };
  if (quantity < minimumStock) return { tone: 'low', label: 'Low stock' };
  return { tone: 'available', label: 'Available' };
}

/** Up to two initials for a tile without a photo, e.g. "Clear Float Glass 5mm" → "CF". */
export function productInitials(name: string): string {
  const words = name.split(/\s+/).map((word) => word.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  return words.slice(0, 2).map((word) => [...word][0]).join('').toUpperCase() || '?';
}

/** Moves the product just added to the front, so it is the first thing seen after saving. */
export function placeFirst<T extends { id: string }>(items: T[], id: string | null): T[] {
  const index = id ? items.findIndex((item) => item.id === id) : -1;
  return index <= 0 ? items : [items[index], ...items.slice(0, index), ...items.slice(index + 1)];
}
