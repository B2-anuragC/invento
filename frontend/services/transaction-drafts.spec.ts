import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { AppSession } from './api';
import type { TransactionDraft } from './transaction-drafts';

vi.mock('./file-storage', () => ({ localizeLegacyUploads: async (value: unknown) => value }));
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  setItem: async (key: string, value: string) => { storage.set(key, value); },
  getItem: async (key: string) => storage.get(key) ?? null,
  removeItem: async (key: string) => { storage.delete(key); },
} }));
import { saveDraft, clearDraft, readDraft } from './transaction-drafts';

describe('Persistent transaction drafts', () => {
  const session = { user: { id: 'user-a' }, businessId: 'business-a' } as AppSession;
  const draft: TransactionDraft = { version: 1, kind: 'sale', requestId: 'request-a', updatedAt: '2026-10-10', contactId: 'customer-a', contactName: 'Customer', quantities: { product: '0.8' }, prices: { product: '50' }, paymentMode: 'partial', paidInput: '10', dueDate: '2026-10-30', paymentMethod: 'CASH', step: 3, outcome: 'unknown' };
  beforeEach(() => storage.clear());
  it('retains decimal quantities, accounting fields and retry identity after a storage reload', async () => {
    await saveDraft(session, draft);
    expect(await readDraft(session, 'sale')).toEqual(draft);
    expect(await readDraft({ ...session, businessId: 'business-b' }, 'sale')).toBeNull();
    expect(await readDraft(session, 'purchase')).toBeNull();
  });
  it('serializes pending writes before clearing a completed or discarded draft', async () => {
    const writing = saveDraft(session, draft);
    const clearing = clearDraft(session, 'sale');
    await Promise.all([writing, clearing]);
    expect(await readDraft(session, 'sale')).toBeNull();
  });
  it('ignores malformed stored JSON', async () => {
    await saveDraft(session, draft);
    for (const key of storage.keys()) storage.set(key, '{bad json');
    expect(await readDraft(session, 'sale')).toBeNull();
  });
  it('retains physical attachment references without storing bytes', async () => {
    const physical = { ...draft, referenceImage: `/files/${'a'.repeat(64)}/original` };
    await saveDraft(session, physical);
    expect(await readDraft(session, 'sale')).toEqual(physical);
    expect([...storage.values()].join('')).not.toContain('base64');
  });


  it('keeps a Quick bill in its own durable slot without replacing an existing sale draft', async () => {
    await saveDraft(session, draft);
    await saveDraft(session, { ...draft, source: 'quick', requestId: 'quick_request', quantities: { product: '3' } }, 'quick');
    vi.resetModules();
    const reopened = await import('./transaction-drafts');
    expect((await reopened.readDraft(session, 'sale'))?.requestId).toBe(draft.requestId);
    expect(await reopened.readDraft(session, 'sale', 'quick')).toMatchObject({ requestId: 'quick_request', source: 'quick', quantities: { product: '3' } });
    expect(await reopened.readDraft({ ...session, businessId: 'other' }, 'sale', 'quick')).toBeNull();
  });
  it('clears in-flight Quick bill writes without clearing the original workflow draft', async () => {
    await saveDraft(session, draft);
    const pending = saveDraft(session, draft, 'quick');
    await clearDraft(session, 'sale', 'quick'); await pending;
    expect(await readDraft(session, 'sale', 'quick')).toBeNull();
    expect(await readDraft(session, 'sale')).toEqual(draft);
  });
});
