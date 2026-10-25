import { randomUUID } from 'expo-crypto';
import { readOfflineState, writeOfflineState } from './offline-storage';
import { acknowledgeCommand, nextReadyCommand, isTransactionCommand, reconcileTransactions, offlineScope, projectOffline, type CatalogEntity, type LocalRecord, type OfflineCommand, type OfflineSnapshot, type OfflineState } from './offline-model';
import { buildOfflineTransaction, productSignature, type TransactionKind, type TransactionRecord } from './offline-transactions';
import type { AppSession, CreateSaleInput, CreatePurchaseInput, InventoryRecord, ProductRecord, SaleRecord, PurchaseRecord } from './api';

type Transport = <T>(path: string, options: RequestInit, session: AppSession) => Promise<T>;
let transport: Transport;
let migrateUploads: (value: unknown, session: AppSession) => Promise<unknown> = async (value) => value;
let currentSession: () => AppSession | null;
const cache = new Map<string, OfflineState>();
const bootstraps = new Map<string, Promise<OfflineState>>();
const workers = new Map<string, Promise<void>>();
let writes: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
export type SyncStatus = { online: boolean; syncing: boolean; pending: number; conflicts: number; lastSync: string | null; message: string };
let status: SyncStatus = { online: true, syncing: false, pending: 0, conflicts: 0, lastSync: null, message: '' };
export const getSyncStatus = () => status;
const incompatibleBackend = (message?: string) => !!message && /expectedTotal.*should not exist|Backend update required:/i.test(message);
const backendUpdateMessage = 'Backend update required: this server does not support offline bill total validation. Update/restart the backend, then tap Sync now. Your bill is saved on this device.';
export function subscribeSyncStatus(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(session?: AppSession, updates: Partial<SyncStatus> = {}) {
  if (session && currentSession && offlineScope(currentSession() ?? session) !== offlineScope(session)) return;
  const state = session ? cache.get(offlineScope(session)) : undefined;
  const next = { ...status, ...(state ? { pending: state.commands.length, conflicts: state.commands.filter((command) => command.state === 'conflict').length, lastSync: state.snapshot.downloadedAt } : {}), ...updates };
  if ((Object.keys(next) as (keyof SyncStatus)[]).every((key) => Object.is(next[key], status[key]))) return;
  status = next;
  listeners.forEach((listener) => listener());
}
export function configureOffline(transportFn: Transport, sessionFn: () => AppSession | null, migrate?: typeof migrateUploads) { transport = transportFn; currentSession = sessionFn; if (migrate) migrateUploads = migrate; }
function stillActive(session: AppSession) { const active = currentSession?.(); return active && offlineScope(active) === offlineScope(session); }
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const result = writes.catch(() => {}).then(work); writes = result; return result;
}
async function load(session: AppSession): Promise<OfflineState | null> {
  const scope = offlineScope(session);
  if (cache.has(scope)) return cache.get(scope)!;
  const raw = await readOfflineState(scope);
  if (!raw) return null;
  const state = (raw.includes('base64') ? await migrateUploads(JSON.parse(raw), session) : JSON.parse(raw)) as OfflineState;
  if (raw.includes('base64')) await writeOfflineState(scope, JSON.stringify(state));
  if (![1, 2].includes(state.version) || state.snapshot.schemaVersion !== 1 || !Array.isArray(state.commands)) throw new Error('Unsupported offline database version. Your saved work has been retained.');
  // Older clients must refuse the extended transaction outbox instead of misreading it.
  if (state.version === 1) { state.version = 2; await writeOfflineState(scope, JSON.stringify(state)); }
  cache.set(scope, state); return state;
}
async function mutate<T>(session: AppSession, update: (state: OfflineState) => T): Promise<T> {
  return serialized(async () => {
    const previous = await load(session);
    if (!previous) throw new Error('Connect once to download this business before working offline.');
    const state: OfflineState = JSON.parse(JSON.stringify(previous));
    const result = update(state);
    await writeOfflineState(offlineScope(session), JSON.stringify(state));
    cache.set(offlineScope(session), state); publish(session); return result;
  });
}
export async function hasOfflineBusiness(session: AppSession) {
  await writes.catch(() => {}); const state = await load(session); return Boolean(state && !state.accessBlocked);
}
async function ensure(session: AppSession): Promise<OfflineState> {
  await writes.catch(() => {});
  const existing = await load(session);
  if (existing) { publish(session); return existing; }
  const scope = offlineScope(session);
  if (!bootstraps.has(scope)) bootstraps.set(scope, (async () => {
    const snapshot = await transport<OfflineSnapshot>('/sync/snapshot', { method: 'GET' }, session);
    const state: OfflineState = { version: 2, snapshot, commands: [] };
    await serialized(async () => { await writeOfflineState(scope, JSON.stringify(state)); cache.set(scope, state); });
    publish(session, { online: true, message: '' }); return state;
  })().finally(() => { bootstraps.delete(scope); }));
  return bootstraps.get(scope)!;
}
export async function offlineView(session: AppSession) {
  const state = await ensure(session);
  if (state.accessBlocked) throw new Error('Business access was revoked. Reconnect to restore access. Your pending work is retained.');
  const view = projectOffline(state);
  const can = (p: string) => (state.snapshot.access.permissions as readonly string[] | undefined)?.includes(p);
  for (const [entity, permission] of Object.entries({ products: 'products.view', customers: 'customers.view', suppliers: 'suppliers.view', sales: 'sales.view', purchases: 'purchases.view', inventory: 'inventory.view', inventoryActivity: 'inventory.view' })) {
    if (!can(permission)) (view as unknown as Record<string, unknown>)[entity] = [];
  }
  if (!can('pricing.view')) {
    view.products = view.products.map(record => { const product = { ...record } as Record<string, unknown>; delete product.purchasePrice; return product as LocalRecord; });
    view.purchases = view.purchases.map(record => {
      const visible = { ...record } as unknown as Record<string, unknown>;
      for (const key of ['total', 'subtotal', 'taxTotal', 'amountPaid', 'attachment', 'payments']) delete visible[key];
      visible.items = record.items.map(item => { const line = { ...item } as Record<string, unknown>; for (const key of ['purchasePrice', 'lineTotal', 'taxAmount']) delete line[key]; return line; });
      return visible as unknown as PurchaseRecord;
    });
  }
  return view;
}
export function setOfflineConnectivity(online: boolean) { publish(undefined, { online }); }

export async function syncOffline(session: AppSession, force = false): Promise<void> {
  if (!session.businessId || !stillActive(session)) return;
  const scope = offlineScope(session);
  if (workers.has(scope)) return workers.get(scope)!;
  const work = (async () => {
    publish(session, { syncing: true });
    try {
      await ensure(session);
      if (!stillActive(session)) return;
      // Full replacement avoids timestamp/cursor gaps in this initial milestone.
      const snapshot = await transport<OfflineSnapshot>('/sync/snapshot', { method: 'GET' }, session);
      await mutate(session, (state) => { state.snapshot = snapshot; state.accessBlocked = false; reconcileTransactions(state);
        // Older apps classified API-version mismatches as permanent bill conflicts.
        // An explicit Sync now can retry these after the server is updated.
        if (force) for (const entry of state.commands) if (isTransactionCommand(entry) && incompatibleBackend(entry.error)) { entry.state = 'pending'; entry.retryAt = 0; entry.error = undefined; } });
      publish(session, { online: true, message: '' });
      for (;;) {
        if (!stillActive(session)) return;
        const state = await load(session);
        if (!state) return;
        const command = nextReadyCommand(state, force ? Infinity : Date.now());
        if (!command) break;
        const { operationId, entityId, entity, action, baseRevision, payload } = command;
        try {
          if (isTransactionCommand(command)) {
            const input = command.payload as unknown as CreateSaleInput | CreatePurchaseInput;
            for (const expected of command.expectations ?? []) {
              const product = state.snapshot.products.find((entry) => entry.id === expected.productId) as ProductRecord | undefined;
              const optionId = command.entity === 'sale' ? (input as CreateSaleInput).items.find((entry) => entry.productId === expected.productId)?.sellingOptionId : undefined;
              if (!product || productSignature(product, optionId) !== expected.signature) throw Object.assign(new Error('An item’s tax, unit or selling option changed. Review the pending bill before retrying.'), { status: 409 });
            }
            await transport<TransactionRecord>(command.entity === 'sale' ? '/sales' : '/purchases', { method: 'POST', body: JSON.stringify(input) }, session);
            // Refresh stock and replace the provisional record atomically with queue acknowledgement.
            // If this fails, retain the original request ID and safely reconcile on the next connection.
            const confirmed = await transport<OfflineSnapshot>('/sync/snapshot', { method: 'GET' }, session);
            if (!(command.entity === 'sale' ? confirmed.sales : confirmed.purchases).some((entry) => entry.requestId === input.requestId)) throw new Error('Waiting for transaction confirmation.');
            await mutate(session, (draft) => { draft.snapshot = confirmed; reconcileTransactions(draft); });
            continue;
          }
          const result = await transport<{ record: LocalRecord | InventoryRecord }>('/sync/push', { method: 'POST', body: JSON.stringify({ operationId, entityId, entity, action, baseRevision, payload }) }, session);
          await mutate(session, (draft) => { acknowledgeCommand(draft, operationId, result.record); });
        } catch (error) {
          const code = (error as { status?: number }).status;
          if (code === 401 || code === 403) throw error;
          const compatibilityError = isTransactionCommand(command) && error instanceof Error && incompatibleBackend(error.message);
          const retryable = compatibilityError || code === undefined || code === 408 || code === 429 || code >= 500;
          await mutate(session, (draft) => {
            const entry = draft.commands.find((item) => item.operationId === operationId);
            if (!entry) return;
            entry.error = compatibilityError
              ? backendUpdateMessage
              : error instanceof Error ? error.message : 'Sync failed.';
            entry.attempts += 1;
            entry.retryAt = Date.now() + Math.min(300000, 2000 * 2 ** Math.min(entry.attempts, 7));
            if (!retryable) entry.state = 'conflict';
          });
          if (retryable) { publish(session, { online: compatibilityError, message: compatibilityError ? backendUpdateMessage : 'Changes are saved on this device. Sync will retry.' }); break; }
        }
      }
    } catch (error) {
      const code = (error as { status?: number }).status;
      if (code === 403 && await load(session)) await mutate(session, (state) => { state.accessBlocked = true; }).catch(() => undefined);
      publish(session, { online: false, message: code === 401 || code === 403 ? 'Sign in or restore business access to synchronize. Local work is retained.' : 'Working from this device. Sync will retry when the API is reachable.' });
    } finally { publish(session, { syncing: false }); }
  })().finally(() => { workers.delete(scope); });
  workers.set(scope, work); return work;
}

export async function saveOfflineCatalog(session: AppSession, entity: CatalogEntity, input: Record<string, unknown>, id?: string): Promise<LocalRecord> {
  await ensure(session);
  const clean = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  const result = await mutate(session, (state) => {
    if (state.accessBlocked || !state.snapshot.access.permissions?.includes(`${entity}.${id ? 'update' : 'create'}`)) throw new Error('You do not have permission to change this business.');
    const view = projectOffline(state);
    const previous = id ? view[entity].find((record) => record.id === id) : undefined;
    if (id && !previous) throw new Error('Record not found on this device.');
    const entityId = id ?? randomUUID();
    const now = new Date().toISOString();
    const record = { status: 'ACTIVE', ...previous, ...clean, id: entityId, businessId: session.businessId, revision: previous ? previous.revision + 1 : 1, createdAt: previous?.createdAt ?? now, updatedAt: now } as LocalRecord;
    if (typeof record.name !== 'string' || !record.name.trim() || record.name.length > 160) throw new Error('Enter a name of up to 160 characters.');
    record.name = record.name.trim();
    if (entity !== 'products' && clean.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(clean.email))) throw new Error('Enter a valid email address.');
    if (entity === 'products') {
      const product = record as ProductRecord;
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(product.sku)) throw new Error('Enter a valid SKU.');
      product.sku = product.sku.trim().toUpperCase();
      const units = ['PIECE', 'KG', 'GRAM', 'LITRE', 'MILLILITRE', 'METRE', 'SQUARE_FOOT', 'FOOT', 'PACK', 'BOX', 'DOZEN', 'OTHER'];
      if (!units.includes(product.unit)) throw new Error('Select a valid stock unit.');
      for (const amount of [product.purchasePrice, product.sellingPrice]) if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(String(amount))) throw new Error('Enter nonnegative prices with up to two decimal places.');
      if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(product.minimumStock)) throw new Error('Enter a valid minimum stock quantity.');
      product.gstRate ??= '0';
      if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(product.gstRate) || Number(product.gstRate) > 100) throw new Error('Enter a GST rate from 0 to 100.');
      if (product.piecesPerUnit && (!Number.isInteger(product.piecesPerUnit) || product.piecesPerUnit < 1 || product.piecesPerUnit > 100000 || !['BOX', 'PACK', 'DOZEN'].includes(product.unit) || (product.unit === 'DOZEN' && product.piecesPerUnit !== 12))) throw new Error('Enter a valid pieces-per-group size.');
      if (view.products.some((item) => item.id !== entityId && ((item as ProductRecord).sku === product.sku || (product.barcode && (item as ProductRecord).barcode === product.barcode)))) throw new Error('A product with this SKU or barcode already exists on this device.');
      product.piecesPerUnit = product.unit === 'DOZEN' ? 12 : product.piecesPerUnit ?? null;
      if (previous && view.inventory.some((stock) => stock.productId === entityId) && (product.unit !== (previous as ProductRecord).unit || product.piecesPerUnit !== ((previous as ProductRecord).piecesPerUnit ?? null))) throw new Error('Stock unit and group size cannot change after opening stock.');
    }
    state.commands.push({ operationId: randomUUID(), entityId, entity, action: previous ? 'update' : 'create', ...(previous ? { baseRevision: previous.revision } : {}), payload: clean, localRecord: record, state: 'pending', attempts: 0, retryAt: 0 });
    return record;
  });
  void syncOffline(session); return result;
}

export async function saveOfflineOpening(session: AppSession, productId: string, quantity: string): Promise<InventoryRecord> {
  await ensure(session);
  const record = await mutate(session, (state) => {
    if (state.accessBlocked || !state.snapshot.access.permissions?.includes('inventory.adjust')) throw new Error('You do not have permission to record stock.');
    const view = projectOffline(state);
    const product = view.products.find((item) => item.id === productId) as ProductRecord | undefined;
    if (!product || product.status !== 'ACTIVE') throw new Error('Select an active product.');
    if (view.inventory.some((item) => item.productId === productId)) throw new Error('Opening stock is already recorded on this device.');
    if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(quantity)) throw new Error('Enter a nonnegative quantity with up to three decimal places.');
    const scaled = Math.round(Number(quantity) * 1000);
    if (product.piecesPerUnit && (scaled * product.piecesPerUnit) % 1000 !== 0) throw new Error('Grouped stock must represent whole pieces.');
    const now = new Date().toISOString();
    const stock = { productId, quantity, createdAt: now, updatedAt: now, product };
    state.commands.push({ operationId: randomUUID(), entityId: randomUUID(), entity: 'opening-stock', action: 'create', payload: { productId, quantity }, localRecord: stock, state: 'pending', attempts: 0, retryAt: 0 });
    return stock;
  });
  void syncOffline(session); return record;
}

export async function retryOfflineConflict(session: AppSession, operationId: string) {
  await mutate(session, (state) => {
    const entry = state.commands.find((command) => command.operationId === operationId);
    if (!entry) return;
    // Retries retain their exact identity and payload; revision conflicts need editing tools in a later milestone.
    entry.state = 'pending'; entry.retryAt = 0; entry.error = undefined;
  });
  void syncOffline(session, true);
}
export async function offlineCommands(session: AppSession): Promise<OfflineCommand[]> { return (await ensure(session)).commands.map((entry) => incompatibleBackend(entry.error) ? { ...entry, error: backendUpdateMessage } : entry); }

export async function saveOfflineTransaction(session: AppSession, kind: TransactionKind, input: CreateSaleInput | CreatePurchaseInput): Promise<TransactionRecord> {
  await ensure(session);
  const payload = JSON.parse(JSON.stringify({ ...input, requestId: input.requestId ?? randomUUID() })) as CreateSaleInput | CreatePurchaseInput;
  const record = await mutate(session, (state) => {
    if (state.accessBlocked || !state.snapshot.access.permissions?.includes(kind === 'sale' ? 'sales.create' : 'purchases.create')) throw new Error('Transaction creation permission is unavailable.');
    const view = projectOffline(state);
    const duplicate = (kind === 'sale' ? view.sales : view.purchases).find((entry) => entry.requestId === payload.requestId);
    if (duplicate) return duplicate;
    const { record, movements, expectations } = buildOfflineTransaction(view, kind, payload);
    state.commands.push({ operationId: randomUUID(), entityId: record.id, entity: kind, action: 'create', payload: { ...payload, expectedTotal: String(record.total) } as unknown as Record<string, unknown>, localRecord: record, movements, expectations, state: 'pending', attempts: 0, retryAt: 0 });
    return record;
  });
  void syncOffline(session);
  return record;
}
export async function refreshOfflineSnapshot(session: AppSession) {
  await syncOffline(session, true);
}
export async function rememberConfirmedTransaction(session: AppSession, kind: 'sale' | 'purchase', record: SaleRecord | PurchaseRecord) {
  await mutate(session, (state) => {
    if (kind === 'sale') state.snapshot.sales = state.snapshot.sales.filter((entry) => entry.id !== record.id).concat(record as SaleRecord);
    else state.snapshot.purchases = state.snapshot.purchases.filter((entry) => entry.id !== record.id).concat(record as PurchaseRecord);
  });
}

/** Preview a rejected bill using current downloaded item settings. Never resubmit silently. */
export async function prepareOfflineTransactionReview(session: AppSession, operationId: string) {
  await syncOffline(session, true);
  if (!status.online || !stillActive(session)) throw new Error('Connect to review the latest item settings before retrying this bill.');
  const state = await load(session);
  const command = state?.commands.find((entry) => entry.operationId === operationId);
  if (!state || !command || !isTransactionCommand(command) || command.state !== 'conflict') throw new Error('This bill is already synchronized or no longer needs review.');
  const view = projectOffline({ ...state, commands: state.commands.slice(0, state.commands.findIndex((entry) => entry.operationId === operationId)) });
  const original = command.localRecord as TransactionRecord;
  const input = JSON.parse(JSON.stringify(command.payload)) as CreateSaleInput | CreatePurchaseInput;
  const fullyPaid = input.amountPaid !== undefined && Number(input.amountPaid) === Number(original.total);
  const preview = buildOfflineTransaction(view, command.entity as TransactionKind, fullyPaid ? { ...input, amountPaid: '0' } : input);
  const payload = { ...input, expectedTotal: String(preview.record.total), ...(fullyPaid ? { amountPaid: String(preview.record.total) } : {}) };
  const rebuilt = buildOfflineTransaction(view, command.entity as TransactionKind, payload);
  return { ...rebuilt, payload, originalTotal: original.total, token: JSON.stringify([payload, rebuilt.expectations, rebuilt.movements]) };
}
export async function applyOfflineTransactionReview(session: AppSession, operationId: string, approvedToken: string) {
  const review = await prepareOfflineTransactionReview(session, operationId);
  if (review.token !== approvedToken) throw new Error('Item settings changed again. Review the updated bill before retrying.');
  await mutate(session, (state) => {
    const command = state.commands.find((entry) => entry.operationId === operationId);
    if (!command || command.state !== 'conflict') throw new Error('This bill no longer needs review.');
    command.payload = review.payload as unknown as Record<string, unknown>;
    command.localRecord = review.record; command.movements = review.movements; command.expectations = review.expectations;
    command.state = 'pending'; command.error = undefined; command.retryAt = 0; command.attempts = 0;
  });
  void syncOffline(session, true);
}

/** Refresh authorization/data without replaying pending writes as a side effect. */
export async function refreshOfflineAccess(session: AppSession) {
  await ensure(session);
  const snapshot = await transport<OfflineSnapshot>('/sync/snapshot', { method: 'GET' }, session);
  await mutate(session, state => { state.snapshot = snapshot; state.accessBlocked = false; reconcileTransactions(state); });
}
