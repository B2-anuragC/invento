import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from './api';
import type { OfflineSnapshot } from './offline-model';
const durable = vi.hoisted(() => new Map<string, string>());
const storageFault = vi.hoisted(() => ({ fail: false }));
vi.mock('./offline-storage', () => ({
  readOfflineState: async (scope: string) => durable.get(scope) ?? null,
  writeOfflineState: async (scope: string, value: string) => { if (storageFault.fail) throw new Error('Storage full'); durable.set(scope, value); },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

describe('Offline catalog synchronization', () => {
  const session = { user: { id: 'user-offline' }, businessId: 'business-offline' } as AppSession;
  let online: boolean;
  let api: typeof import('./offline-catalog');
  let snapshot: OfflineSnapshot;
  let uploads: Record<string, unknown>[];
  beforeEach(async () => {
    vi.resetModules(); durable.clear(); storageFault.fail = false; online = true; uploads = [];
    snapshot = { schemaVersion: 1, business: { id: session.businessId, name: 'Shop' }, access: { role: 'OWNER', membersCanViewPurchasePrice: true }, downloadedAt: '2026-10-10T00:00:00Z', products: [], customers: [], suppliers: [], inventory: [], inventoryActivity: [], sales: [], purchases: [] };
    api = await import('./offline-catalog');
    api.configureOffline(async <T>(path: string, options: RequestInit) => {
      if (!online) throw new TypeError('Network unavailable');
      if (path === '/sync/snapshot') return JSON.parse(JSON.stringify(snapshot)) as T;
      const command = JSON.parse(String(options.body)); uploads.push(command);
      const record = { ...command.payload, id: command.entityId, revision: (command.baseRevision ?? 0) + 1, updatedAt: '2026-10-10T12:00:00Z', status: 'ACTIVE' };
      return { record } as T;
    }, () => session);
  });
  it('reopens durable local work offline and uploads create then update with stable identifiers', async () => {
    await api.offlineView(session);
    online = false;
    const customer = await api.saveOfflineCatalog(session, 'customers', { name: 'Offline customer' });
    await api.syncOffline(session);
    await api.saveOfflineCatalog(session, 'customers', { phone: '9876543210' }, customer.id);
    await api.syncOffline(session);
    expect((await api.offlineView(session)).customers[0]).toMatchObject({ name: 'Offline customer', phone: '9876543210', revision: 2 });
    const pending = await api.offlineCommands(session);
    vi.resetModules();
    api = await import('./offline-catalog');
    api.configureOffline(async <T>(path: string, options: RequestInit) => {
      if (!online) throw new TypeError('Network unavailable');
      if (path === '/sync/snapshot') return snapshot as T;
      const command = JSON.parse(String(options.body)); uploads.push(command);
      return { record: { ...command.payload, id: command.entityId, name: 'Offline customer', revision: (command.baseRevision ?? 0) + 1 } } as T;
    }, () => session);
    expect(await api.hasOfflineBusiness(session)).toBe(true);
    expect((await api.offlineView(session)).customers[0].id).toBe(customer.id);
    online = true;
    await api.syncOffline(session, true);
    expect(uploads.map((command) => command.operationId)).toEqual(pending.map((command) => command.operationId));
    expect(uploads.map((command) => command.action)).toEqual(['create', 'update']);
    expect(await api.offlineCommands(session)).toHaveLength(0);
    expect((await api.offlineView(session)).customers).toHaveLength(1);
  });
  it('keeps rejected local work and stops dependent updates without blocking another contact', async () => {
    await api.offlineView(session); online = false;
    const first = await api.saveOfflineCatalog(session, 'customers', { name: 'Conflict' });
    await api.syncOffline(session);
    await api.saveOfflineCatalog(session, 'customers', { phone: '123' }, first.id);
    await api.syncOffline(session);
    await api.saveOfflineCatalog(session, 'suppliers', { name: 'Independent' });
    await api.syncOffline(session);
    online = true;
    api.configureOffline(async <T>(path: string, options: RequestInit) => {
      if (path === '/sync/snapshot') return snapshot as T;
      const command = JSON.parse(String(options.body)); uploads.push(command);
      if (command.entity === 'customers') throw Object.assign(new Error('Conflict'), { status: 409 });
      return { record: { ...command.payload, id: command.entityId, revision: 1 } } as T;
    }, () => session);
    await api.syncOffline(session, true);
    expect(uploads.map((command) => command.entity)).toEqual(['customers', 'suppliers']);
    expect(await api.offlineCommands(session)).toHaveLength(2);
    expect(api.getSyncStatus().conflicts).toBe(1);
    expect((await api.offlineView(session)).customers[0].name).toBe('Conflict');
  });
  it('keeps the same operation identity after a lost upload response', async () => {
    await api.offlineView(session); online = false;
    await api.saveOfflineCatalog(session, 'customers', { name: 'Lost response' });
    await api.syncOffline(session);
    const pending = (await api.offlineCommands(session))[0];
    online = true;
    let loseResponse = true;
    api.configureOffline(async <T>(path: string, options: RequestInit) => {
      if (path === '/sync/snapshot') return snapshot as T;
      const command = JSON.parse(String(options.body)); uploads.push(command);
      if (loseResponse) { loseResponse = false; throw new TypeError('Response lost after commit'); }
      return { record: { id: command.entityId, name: 'Lost response', revision: 1 } } as T;
    }, () => session);
    await api.syncOffline(session, true);
    expect(await api.offlineCommands(session)).toHaveLength(1);
    await api.syncOffline(session, true);
    expect(uploads.map((command) => command.operationId)).toEqual([pending.operationId, pending.operationId]);
    expect(await api.offlineCommands(session)).toHaveLength(0);
    expect((await api.offlineView(session)).customers).toHaveLength(1);
  });
  it('does not claim a local save or change the projection if storage fails', async () => {
    await api.offlineView(session); online = false; storageFault.fail = true;
    await expect(api.saveOfflineCatalog(session, 'customers', { name: 'Unsaved' })).rejects.toThrow('Storage full');
    expect((await api.offlineView(session)).customers).toHaveLength(0);
    expect(await api.offlineCommands(session)).toHaveLength(0);
  });
  it('isolates business databases and checks permissions before local writes', async () => {
    snapshot.access.role = 'MEMBER';
    await api.offlineView(session);
    await expect(api.saveOfflineCatalog(session, 'customers', { name: 'Denied' })).rejects.toThrow('permission');
    expect(await api.hasOfflineBusiness({ ...session, businessId: 'other' })).toBe(false);
    expect(await api.offlineCommands(session)).toHaveLength(0);
  });
});
