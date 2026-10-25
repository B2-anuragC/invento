import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSession } from './api';

const key = (session: AppSession) => `invento.favorites.v1.${session.user.id}.${session.businessId}`;
export async function readProductFavorites(session: AppSession): Promise<Record<string, boolean>> {
  const raw = await AsyncStorage.getItem(key(session));
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, selected]) => selected === true));
}
export async function saveProductFavorites(session: AppSession, favorites: Record<string, boolean>) {
  await AsyncStorage.setItem(key(session), JSON.stringify(favorites));
}
