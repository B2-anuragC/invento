import type { GuestJournalEntry } from './local-api';
import type { OfflineSnapshot } from './offline-model';

// Moving a guest shop to an account. The device journaled every change as the
// request the server would have taken; the upload sends them again, in order,
// to a new shop on the account. The shop is new and the order is the same, so
// the server numbers bills and notes as the phone did. Products, customers and
// suppliers keep their device ids (as the offline outbox already does); bills,
// their lines and the shop get server ids, and later requests are mapped onto
// them. Every request carries its own request id, so an interrupted upload
// continues where it stopped without doing anything twice.

/** Saved after every step, so the upload can continue after an interruption. */
export type GuestUploadState = {
  version: 1;
  localBusinessId: string;
  /** The account's new shop, once created. */
  businessId: string | null;
  /** The shop id asked for, kept so a retry finds a shop created just before an interruption. */
  slug: string | null;
  /** Journal entries done. */
  done: number;
  /** Device id → server id, for bills and their lines. */
  ids: Record<string, string>;
  /** Server revision of each product, customer and supplier, for later updates. */
  revisions: Record<string, number>;
  /** The server's copy of each bill after its last step, by device id, to compare with the phone. */
  bills: Record<string, UploadedBill>;
};

export type UploadedBill = { id: string; documentNumber?: string | null; total?: string | number; returnedTotal?: string | number; status?: string; returns?: { documentNumber: string }[]; items?: { id: string; productId: string; quantity: string | number }[] };
export type UploadRequest = { method: string; path: string; body?: Record<string, unknown> };
/** Sends a request to the account, for the given shop (none before it exists). */
export type UploadSend = <T>(request: UploadRequest, businessId: string | null) => Promise<T>;

export function newUploadState(localBusinessId: string): GuestUploadState {
  return { version: 1, localBusinessId, businessId: null, slug: null, done: 0, ids: {}, revisions: {}, bills: {} };
}

const MAX_REASON = 200;
const indiaDate = (iso: string) => new Date(Date.parse(iso) + 19_800_000).toISOString().slice(0, 10);
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayText = (iso: string) => { const [year, month, day] = indiaDate(iso).split('-'); return `${Number(day)} ${months[Number(month) - 1]} ${year}`; };
/** Says when and where an edit or cancellation was made; the account records it at upload time. */
export function guestNote(reason: string, at: string): string {
  const note = ` · Made on the phone in guest mode, ${dayText(at)}`;
  return `${reason.trim().slice(0, MAX_REASON - note.length)}${note}`;
}

const billPath = /^\/(sales|purchases)\/([^/]+)(\/.*)?$/;
const walkIn = (businessId: string) => `walkin_${businessId}`;

/**
 * The request to send for a journal entry, mapped onto the account's ids, or
 * null when it has nothing to send (an edit of the walk-in customer, which the
 * account keeps fixed).
 */
export function prepareRequest(entry: GuestJournalEntry, state: GuestUploadState): UploadRequest | null {
  const body = entry.body && typeof entry.body === 'object' ? JSON.parse(JSON.stringify(entry.body)) as Record<string, unknown> : undefined;
  const map = (id: string) => state.ids[id] ?? id;
  if (entry.path === '/businesses' && entry.method === 'POST') return { method: 'POST', path: '/businesses', body: { ...body, slug: state.slug ?? body?.slug } };
  if (/^\/businesses\/[^/]+$/.test(entry.path)) return { method: entry.method, path: `/businesses/${encodeURIComponent(state.businessId ?? '')}`, body };

  if (entry.path === '/sync/push' && body) {
    if (String(body.entityId).startsWith('walkin_')) return null;
    if (body.action === 'update' && state.revisions[String(body.entityId)] !== undefined) body.baseRevision = state.revisions[String(body.entityId)];
    return { method: 'POST', path: '/sync/push', body };
  }
  if (entry.path === '/inventory/adjustments' && body) {
    // The account's stock is the phone's after the same steps; a count is not checked again.
    delete body.expectedQuantity;
    return { method: 'POST', path: entry.path, body };
  }
  if ((entry.path === '/sales' || entry.path === '/purchases') && body) {
    if (state.businessId && body.customerId === walkIn(state.localBusinessId)) body.customerId = walkIn(state.businessId);
    return { method: 'POST', path: entry.path, body };
  }

  const match = billPath.exec(entry.path);
  if (match && body) {
    const [, collection, localId, action = ''] = match;
    const path = `/${collection}/${encodeURIComponent(map(decodeURIComponent(localId)))}${action}`;
    if (action === '/payments') body.paidAt ??= entry.at;
    if (action === '/returns') {
      body.items = (body.items as { itemId: string; quantity: string }[]).map((item) => ({ ...item, itemId: map(item.itemId) }));
      body.returnDate ??= entry.at;
    }
    if (action === '/items') {
      // The account's revision follows the phone's; the totals and refund are still checked.
      delete body.revision;
      body.reason = guestNote(String(body.reason ?? ''), entry.at);
    }
    if (action === '/cancel') body.reason = guestNote(String(body.reason ?? ''), entry.at);
    return { method: entry.method, path, body };
  }
  return { method: entry.method, path: entry.path, body };
}

/** Pairs the phone's bill lines with the account's, by position when the products agree, otherwise by product and quantity. */
function mapLines(localIds: string[] | undefined, bill: UploadedBill, ids: Record<string, string>, localLines: { id: string; productId: string; quantity: string | number }[] | undefined) {
  const serverLines = bill.items ?? [];
  if (!localIds?.length) return;
  const used = new Set<string>();
  localIds.forEach((localId, index) => {
    const local = localLines?.find((line) => line.id === localId);
    const sameProduct = (line: { productId: string }) => !local || line.productId === local.productId;
    const byPosition = serverLines[index];
    const match = byPosition && sameProduct(byPosition) && !used.has(byPosition.id)
      ? byPosition
      : serverLines.find((line) => !used.has(line.id) && sameProduct(line) && (!local || Number(line.quantity) === Number(local.quantity)));
    if (match) { ids[localId] = match.id; used.add(match.id); }
  });
}

/** Keeps what a response says the device's ids now are on the account. */
export function recordResponse(entry: GuestJournalEntry, response: unknown, state: GuestUploadState, localLines?: (localBillId: string) => { id: string; productId: string; quantity: string | number }[] | undefined) {
  const record = response as Record<string, unknown> | null;
  if (entry.path === '/businesses' && entry.method === 'POST') {
    state.businessId = String(record?.id);
    if (entry.localId) state.ids[entry.localId] = state.businessId;
    return;
  }
  if (entry.path === '/sync/push') {
    const saved = (record?.record ?? null) as { revision?: number } | null;
    const entityId = String((entry.body as { entityId?: string }).entityId);
    if (typeof saved?.revision === 'number') state.revisions[entityId] = saved.revision;
    return;
  }
  const bill = record as UploadedBill | null;
  if (!bill?.id || !entry.localId || !billPath.test(entry.path) && entry.path !== '/sales' && entry.path !== '/purchases') return;
  state.ids[entry.localId] = bill.id;
  // A new bill, or one whose lines an edit replaced, gives its lines new ids.
  if (entry.path === '/sales' || entry.path === '/purchases' || entry.path.endsWith('/items')) mapLines(entry.localItemIds, bill, state.ids, localLines?.(entry.localId));
  state.bills[entry.localId] = bill;
}

const kindOf = (path: string) => (path.startsWith('/sales') ? 'sale' : 'purchase');

export type UploadSummary = { products: number; customers: number; suppliers: number; bills: number; notes: number };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** "12 products, 5 customers, 3 suppliers, 18 bills, 2 credit or debit notes". */
export function summaryText(summary: UploadSummary) {
  return [
    plural(summary.products, 'product', 'products'),
    plural(summary.customers, 'customer', 'customers'),
    plural(summary.suppliers, 'supplier', 'suppliers'),
    plural(summary.bills, 'bill', 'bills'),
    ...(summary.notes ? [plural(summary.notes, 'credit or debit note', 'credit or debit notes')] : []),
  ].join(', ');
}

/** What will be uploaded, for the confirmation. */
export function uploadSummary(snapshot: OfflineSnapshot): UploadSummary {
  const notes = [...snapshot.sales, ...snapshot.purchases].reduce((sum, bill) => sum + ((bill as { returns?: unknown[] }).returns?.length ?? 0), 0);
  return {
    products: snapshot.products.length,
    customers: snapshot.customers.filter((customer) => !(customer as { isWalkIn?: boolean }).isWalkIn).length,
    suppliers: snapshot.suppliers.length,
    bills: snapshot.sales.length + snapshot.purchases.length,
    notes,
  };
}

/** One line per bill whose number, total, returns or status differ on the account. */
export function uploadDifferences(snapshot: OfflineSnapshot, state: GuestUploadState): string[] {
  const differences: string[] = [];
  const money = (value: unknown) => Math.round(Number(value ?? 0) * 100);
  for (const local of [...snapshot.sales, ...snapshot.purchases] as unknown as UploadedBill[]) {
    const uploaded = state.bills[local.id];
    const name = local.documentNumber ?? 'A bill';
    if (!uploaded) { differences.push(`${name} was not uploaded.`); continue; }
    if (uploaded.documentNumber !== local.documentNumber) differences.push(`${name} is ${uploaded.documentNumber ?? 'unnumbered'} on the account.`);
    if (money(uploaded.total) !== money(local.total)) differences.push(`${name}: total ₹${Number(local.total).toFixed(2)} on the phone, ₹${Number(uploaded.total).toFixed(2)} on the account.`);
    if (money(uploaded.returnedTotal) !== money(local.returnedTotal)) differences.push(`${name}: returns ₹${Number(local.returnedTotal ?? 0).toFixed(2)} on the phone, ₹${Number(uploaded.returnedTotal ?? 0).toFixed(2)} on the account.`);
    if ((uploaded.status ?? 'COMPLETED') !== (local.status ?? 'COMPLETED')) differences.push(`${name} is ${String(uploaded.status).toLowerCase()} on the account.`);
    const localNotes = (local.returns ?? []).map((note) => note.documentNumber);
    const uploadedNotes = (uploaded.returns ?? []).map((note) => note.documentNumber);
    localNotes.forEach((number, index) => { if (uploadedNotes[index] !== number) differences.push(`${number} is ${uploadedNotes[index] ?? 'missing'} on the account.`); });
  }
  return differences;
}

const status = (error: unknown) => (error as { status?: number }).status;

/**
 * Sends the journal from where the saved state stopped. The new shop is
 * created first; if its id is taken on the server, a number is added. The
 * state is saved after each step, so a failure can be retried.
 */
export async function uploadGuestJournal(options: {
  entries: GuestJournalEntry[];
  state: GuestUploadState;
  send: UploadSend;
  save: (state: GuestUploadState) => Promise<void>;
  onProgress?: (done: number, total: number, label: string) => void;
  localLines?: (localBillId: string) => { id: string; productId: string; quantity: string | number }[] | undefined;
}): Promise<GuestUploadState> {
  const { entries, state, send, save } = options;
  for (let index = state.done; index < entries.length; index += 1) {
    const entry = entries[index];
    options.onProgress?.(index, entries.length, stepLabel(entry));
    if (entry.path === '/businesses' && entry.method === 'POST' && !state.businessId) {
      await createShop(entry, state, send, save);
    } else {
      const request = prepareRequest(entry, state);
      if (request) recordResponse(entry, await send(request, state.businessId), state, options.localLines);
    }
    state.done = index + 1;
    await save(state);
  }
  options.onProgress?.(entries.length, entries.length, 'Done');
  return state;
}

async function createShop(entry: GuestJournalEntry, state: GuestUploadState, send: UploadSend, save: (state: GuestUploadState) => Promise<void>) {
  const wanted = String((entry.body as { slug?: string } | undefined)?.slug ?? 'guest-shop');
  // An earlier try may have created the shop and stopped before saving it.
  if (state.slug) {
    const memberships = await send<{ business: { id: string; slug: string } }[]>({ method: 'GET', path: '/businesses' }, null);
    const created = memberships.find((membership) => membership.business.slug === state.slug);
    if (created) { recordResponse(entry, created.business, state); return; }
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    state.slug = attempt === 0 ? wanted : `${wanted.slice(0, 76)}-${attempt + 1}`;
    await save(state);
    try {
      recordResponse(entry, await send({ method: 'POST', path: '/businesses', body: { ...(entry.body as object), slug: state.slug } }, null), state);
      return;
    } catch (error) {
      if (status(error) !== 409) throw error;
    }
  }
  throw new Error('Could not find a free shop ID on the account. Rename the shop and try again.');
}

/** A short description of a step, for the progress line. */
export function stepLabel(entry: GuestJournalEntry): string {
  if (entry.path.startsWith('/businesses')) return 'Shop details';
  if (entry.path === '/sync/push') {
    const entity = (entry.body as { entity?: string } | undefined)?.entity;
    return entity === 'products' ? 'Products' : entity === 'customers' ? 'Customers' : entity === 'suppliers' ? 'Suppliers' : 'Opening stock';
  }
  if (entry.path === '/inventory/adjustments') return 'Stock adjustments';
  if (entry.path.endsWith('/payments')) return 'Payments';
  if (entry.path.endsWith('/returns')) return kindOf(entry.path) === 'sale' ? 'Credit notes' : 'Debit notes';
  if (entry.path.endsWith('/items')) return 'Bill edits';
  if (entry.path.endsWith('/cancel')) return 'Cancelled bills';
  return kindOf(entry.path) === 'sale' ? 'Sales' : 'Purchases';
}
