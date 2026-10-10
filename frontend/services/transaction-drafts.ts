import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSession } from './api';
export type TransactionDraft = {
  version: 1; kind: 'sale' | 'purchase'; requestId: string; updatedAt: string; contactId: string; contactName: string; quantities: Record<string, string>; prices: Record<string, string>; sellingUnits?: Record<string, string>; selectedOptions?: Record<string, string>; invoiceNumber?: string; paymentMode: 'full' | 'partial' | 'credit'; paidInput: string; dueDate: string; paymentMethod: string; step: 1 | 2 | 3; outcome: 'rejected' | 'unknown' | null;
};
const key = (session: AppSession, kind: TransactionDraft['kind']) => `invento.draft.v1.${session.user.id}.${session.businessId}.${kind}`;
let writes = Promise.resolve();
export function saveDraft(session: AppSession, draft: TransactionDraft) {
  const result = writes.catch(() => {}).then(() => AsyncStorage.setItem(key(session, draft.kind), JSON.stringify(draft)));
  writes = result;
  return result;
}
export function clearDraft(session: AppSession, kind: TransactionDraft['kind']) {
  const result = writes.catch(() => {}).then(() => AsyncStorage.removeItem(key(session, kind)));
  writes = result;
  return result;
}
export async function readDraft(session: AppSession, kind: TransactionDraft['kind']): Promise<TransactionDraft | null> {
  await writes.catch(() => {});
  const raw = await AsyncStorage.getItem(key(session, kind));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    const stringRecord = (entry: unknown) => entry !== null && typeof entry === 'object' && !Array.isArray(entry) && Object.values(entry).every((item) => typeof item === 'string');
    if (value.version !== 1 || value.kind !== kind || typeof value.requestId !== 'string' || !stringRecord(value.quantities) || !stringRecord(value.prices) || ![1, 2, 3].includes(value.step)) return null;
    if (!['full', 'partial', 'credit'].includes(value.paymentMode) || !['updatedAt', 'contactId', 'contactName', 'paidInput', 'dueDate', 'paymentMethod'].every((field) => typeof value[field] === 'string')) return null;
    if (![null, 'rejected', 'unknown'].includes(value.outcome) || (value.sellingUnits !== undefined && !stringRecord(value.sellingUnits)) || (value.selectedOptions !== undefined && !stringRecord(value.selectedOptions))) return null;
    return value;
  } catch { return null; }
}
