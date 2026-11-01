import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSession } from './api';
import type { OfflineSnapshot } from './offline-model';

// Two stores: the guest's phone, and a stand-in for the account. The device
// handler numbers bills and notes like the server, so replaying the phone's
// journal into a new shop there must give the same shop.
const stores = vi.hoisted(() => ({ phone: new Map<string, string>(), account: new Map<string, string>(), active: 'phone' as 'phone' | 'account' }));
vi.mock('./offline-storage', () => ({
  readOfflineState: async (key: string) => stores[stores.active].get(key) ?? null,
  writeOfflineState: async (key: string, value: string) => { stores[stores.active].set(key, value); },
  deleteOfflineState: async (key: string) => { stores[stores.active].delete(key); },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

let api: typeof import('./local-api');
let upload: typeof import('./guest-upload');
let phone: AppSession;

const on = <T>(store: 'phone' | 'account', work: () => Promise<T>) => { stores.active = store; return work(); };
const call = <T>(session: AppSession, method: string, path: string, body?: unknown) => api.localRequest<T>(path, body === undefined ? { method } : { method, body: JSON.stringify(body) }, session);

beforeEach(async () => {
  vi.resetModules();
  stores.phone.clear();
  stores.account.clear();
  stores.active = 'phone';
  api = await import('./local-api');
  upload = await import('./guest-upload');
  phone = { ...(await api.localSession()), mode: 'guest' };
});

/** A guest shop with catalog, stock, bills, payments, a return, an edit, a cancellation and an adjustment. */
async function guestShop() {
  const shop = await call<{ id: string }>(phone, 'POST', '/businesses', { name: 'Guest Hardware', slug: 'guest-hardware' });
  phone.businessId = shop.id;
  await call(phone, 'PATCH', `/businesses/${shop.id}`, { gstin: '27AAPFU0939F1ZV', address: 'Shop 4' });
  const push = (entity: string, entityId: string, payload: Record<string, unknown>, action = 'create', baseRevision?: number) =>
    call(phone, 'POST', '/sync/push', { operationId: crypto.randomUUID(), entity, entityId, action, ...(baseRevision ? { baseRevision } : {}), payload });
  await push('products', 'hinge-0001', { name: 'Hinge', sku: 'HG-1', unit: 'PIECE', sellingPrice: '60.00', purchasePrice: '40.00', minimumStock: '0', gstRate: '18' });
  await push('products', 'hinge-0001', { sellingPrice: '65.00' }, 'update', 1);
  await push('customers', 'ravi-traders', { name: 'Ravi Traders' });
  await push('suppliers', 'saint-glass', { name: 'Saint Glass' });
  await push('opening-stock', 'stock-hinge', { productId: 'hinge-0001', quantity: '25' });
  const sale = (requestId: string, quantity: string, extra: Record<string, unknown> = {}) => call<any>(phone, 'POST', '/sales', { requestId, customerId: 'ravi-traders', saleDate: '2026-10-20T10:00:00Z', paymentMethod: 'UPI', amountPaid: '0', chargeGst: true, items: [{ productId: 'hinge-0001', quantity, sellingPrice: '65.00' }], ...extra });
  const first = await sale('local_first_sale', '3');
  await call(phone, 'POST', `/sales/${first.id}/payments`, { requestId: 'payment_first', amount: '100.00', method: 'CASH' });
  await call(phone, 'POST', `/sales/${first.id}/returns`, { requestId: 'return_first', items: [{ itemId: first.items[0].id, quantity: '1' }], reason: 'Bent' });
  const second = await sale('local_second_sale', '4', { amountPaid: '306.80' });
  const edited = await call<any>(phone, 'PUT', `/sales/${second.id}/items`, { requestId: 'edit_second', reason: 'Took fewer', chargeGst: true, items: [{ productId: 'hinge-0001', quantity: '2', sellingPrice: '65.00' }] });
  await call(phone, 'POST', `/sales/${second.id}/returns`, { requestId: 'return_second', items: [{ itemId: edited.items[0].id, quantity: '1' }] });
  const walkIn = await sale('local_walk_in', '1', { customerId: `walkin_${shop.id}`, amountPaid: '76.70' });
  const purchase = await call<any>(phone, 'POST', '/purchases', { requestId: 'local_purchase', supplierId: 'saint-glass', purchaseDate: '2026-10-21T10:00:00Z', amountPaid: '0', chargeGst: false, items: [{ productId: 'hinge-0001', quantity: '10', purchasePrice: '40.00' }] });
  await call(phone, 'POST', `/purchases/${purchase.id}/cancel`, { reason: 'Wrong supplier' });
  await call(phone, 'POST', '/inventory/adjustments', { productId: 'hinge-0001', type: 'DAMAGE', quantity: '2', note: 'Cracked', expectedQuantity: '21' });
  return { shop, first, second, walkIn };
}

/** Sends upload requests to the account store, as the account's owner. */
function accountSend(account: AppSession) {
  return <T>(request: { method: string; path: string; body?: unknown }, businessId: string | null) =>
    on('account', () => call<T>({ ...account, businessId: businessId ?? '' }, request.method, request.path, request.body));
}

describe('uploading a guest shop', () => {
  it('rebuilds the shop on the account with the same numbers, totals, returns and stock', async () => {
    await guestShop();
    const entries = await api.guestJournal(phone.businessId);
    const device = await call<OfflineSnapshot>(phone, 'GET', '/sync/snapshot');
    const account = await on('account', () => api.localSession());
    const steps: string[] = [];
    const state = await upload.uploadGuestJournal({ entries, state: upload.newUploadState(phone.businessId), send: accountSend(account), save: async () => {}, onProgress: (_done, _total, label) => steps.push(label) });

    expect(state.done).toBe(entries.length);
    expect(state.businessId).not.toBe(phone.businessId);
    expect(upload.uploadDifferences(device, state)).toEqual([]);
    const uploaded = await on('account', () => call<OfflineSnapshot>({ ...account, businessId: state.businessId! }, 'GET', '/sync/snapshot'));
    expect(uploaded.inventory[0].quantity).toBe(device.inventory[0].quantity);
    expect(uploaded.sales.map((sale) => sale.documentNumber)).toEqual(device.sales.map((sale) => sale.documentNumber));
    expect((uploaded.sales as any[]).flatMap((sale) => sale.returns ?? []).map((note) => note.documentNumber)).toEqual(['CN/2026-27/0001', 'CN/2026-27/0002']);
    expect(uploaded.sales.find((sale) => sale.documentNumber === 'INV/2026-27/0003')?.customer.id).toBe(`walkin_${state.businessId}`);
    expect((uploaded.business as any)).toMatchObject({ name: 'Guest Hardware', gstin: '27AAPFU0939F1ZV', address: 'Shop 4' });
    expect(uploaded.products[0]).toMatchObject({ id: 'hinge-0001', sellingPrice: '65.00' });
    // Edits and cancellations say they were made on the phone.
    expect((uploaded.sales as any[]).find((sale) => sale.editReason)?.editReason).toMatch(/^Took fewer · Made on the phone in guest mode, \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    expect((uploaded.purchases as any[])[0]).toMatchObject({ status: 'CANCELLED', cancelReason: expect.stringMatching(/^Wrong supplier · Made on the phone in guest mode/) });
    expect(steps).toEqual(expect.arrayContaining(['Shop details', 'Products', 'Opening stock', 'Sales', 'Payments', 'Credit notes', 'Bill edits', 'Purchases', 'Cancelled bills', 'Stock adjustments']));
  });

  it('continues after an interruption without doing anything twice', async () => {
    await guestShop();
    const entries = await api.guestJournal(phone.businessId);
    const device = await call<OfflineSnapshot>(phone, 'GET', '/sync/snapshot');
    const account = await on('account', () => api.localSession());
    const send = accountSend(account);
    let saved = upload.newUploadState(phone.businessId);
    const save = async (state: typeof saved) => { saved = JSON.parse(JSON.stringify(state)); };
    let calls = 0;
    const flaky: typeof send = (request, businessId) => (++calls === 9 ? Promise.reject(new Error('Network request failed')) : send(request, businessId));
    await expect(upload.uploadGuestJournal({ entries, state: JSON.parse(JSON.stringify(saved)), send: flaky, save })).rejects.toThrow('Network request failed');
    expect(saved.done).toBeGreaterThan(0);
    expect(saved.done).toBeLessThan(entries.length);
    const state = await upload.uploadGuestJournal({ entries, state: saved, send, save });
    expect(upload.uploadDifferences(device, state)).toEqual([]);
    const uploaded = await on('account', () => call<OfflineSnapshot>({ ...account, businessId: state.businessId! }, 'GET', '/sync/snapshot'));
    expect(uploaded.sales).toHaveLength(device.sales.length);
    expect(uploaded.inventory[0].quantity).toBe(device.inventory[0].quantity);
  });

  it('adds a number when the shop ID is taken, and finds a shop created just before an interruption', async () => {
    const entry = { seq: 1, at: '2026-11-01T10:00:00Z', method: 'POST', path: '/businesses', body: { name: 'Guest Hardware', slug: 'guest-hardware' }, localId: 'device-shop' };
    const sent: string[] = [];
    const send = vi.fn(async (request: { method: string; path: string; body?: any }) => {
      if (request.method === 'GET') return [{ business: { id: 'account-shop', slug: 'guest-hardware-2' } }];
      sent.push(request.body.slug);
      if (request.body.slug === 'guest-hardware') throw Object.assign(new Error('Taken'), { status: 409 });
      return { id: 'account-shop', slug: request.body.slug };
    });
    const state = await upload.uploadGuestJournal({ entries: [entry], state: upload.newUploadState('device-shop'), send: send as never, save: async () => {} });
    expect(sent).toEqual(['guest-hardware', 'guest-hardware-2']);
    expect(state).toMatchObject({ businessId: 'account-shop', slug: 'guest-hardware-2', ids: { 'device-shop': 'account-shop' } });
    // Interrupted after the shop was made but before it was saved: it is found, not made again.
    sent.length = 0;
    const again = await upload.uploadGuestJournal({ entries: [entry], state: { ...upload.newUploadState('device-shop'), slug: 'guest-hardware-2' }, send: send as never, save: async () => {} });
    expect(sent).toEqual([]);
    expect(again.businessId).toBe('account-shop');
  });
});

describe('prepareRequest', () => {
  const state = { ...((): any => ({ version: 1, localBusinessId: 'phone-shop', businessId: 'account-shop', slug: 'shop', done: 0, ids: { 'bill-1': 'server-bill', 'line-1': 'server-line' }, revisions: { 'product-1': 3 }, bills: {} }))() };
  const entry = (method: string, path: string, body: Record<string, unknown>) => ({ seq: 1, at: '2026-10-25T08:00:00Z', method, path, body });

  it('maps the phone ids onto the account and keeps dates', () => {
    expect(upload.prepareRequest(entry('POST', '/sales', { customerId: 'walkin_phone-shop' }), state)?.body).toEqual({ customerId: 'walkin_account-shop' });
    expect(upload.prepareRequest(entry('POST', '/sales/bill-1/payments', { requestId: 'p1', amount: '5' }), state)).toEqual({ method: 'POST', path: '/sales/server-bill/payments', body: { requestId: 'p1', amount: '5', paidAt: '2026-10-25T08:00:00Z' } });
    expect(upload.prepareRequest(entry('POST', '/sales/bill-1/returns', { requestId: 'r1', items: [{ itemId: 'line-1', quantity: '1' }] }), state)?.body).toEqual({ requestId: 'r1', items: [{ itemId: 'server-line', quantity: '1' }], returnDate: '2026-10-25T08:00:00Z' });
    expect(upload.prepareRequest(entry('PATCH', '/businesses/phone-shop', { address: 'Shop 4' }), state)).toEqual({ method: 'PATCH', path: '/businesses/account-shop', body: { address: 'Shop 4' } });
  });

  it('notes edits and cancellations made on the phone, and drops checks that no longer apply', () => {
    expect(upload.prepareRequest(entry('PUT', '/sales/bill-1/items', { revision: 2, reason: 'Took fewer', expectedRefund: '0.00' }), state)?.body).toEqual({ reason: 'Took fewer · Made on the phone in guest mode, 25 Oct 2026', expectedRefund: '0.00' });
    expect(upload.prepareRequest(entry('POST', '/purchases/bill-1/cancel', { reason: 'x'.repeat(200) }), state)?.body?.reason).toHaveLength(200);
    expect(upload.prepareRequest(entry('POST', '/inventory/adjustments', { productId: 'p', expectedQuantity: '20' }), state)?.body).toEqual({ productId: 'p' });
    expect(upload.prepareRequest(entry('POST', '/sync/push', { entity: 'products', entityId: 'product-1', action: 'update', baseRevision: 1, payload: {} }), state)?.body?.baseRevision).toBe(3);
    expect(upload.prepareRequest(entry('POST', '/sync/push', { entity: 'customers', entityId: 'walkin_phone-shop', action: 'update', payload: { name: 'Counter' } }), state)).toBeNull();
  });
});

describe('uploadSummary and summaryText', () => {
  it('counts what moves, leaving out the walk-in customer', async () => {
    await guestShop();
    const summary = upload.uploadSummary(await call<OfflineSnapshot>(phone, 'GET', '/sync/snapshot'));
    expect(summary).toEqual({ products: 1, customers: 1, suppliers: 1, bills: 4, notes: 2 });
    expect(upload.summaryText(summary)).toBe('1 product, 1 customer, 1 supplier, 4 bills, 2 credit or debit notes');
    expect(upload.summaryText({ products: 2, customers: 0, suppliers: 3, bills: 1, notes: 0 })).toBe('2 products, 0 customers, 3 suppliers, 1 bill');
  });
});
