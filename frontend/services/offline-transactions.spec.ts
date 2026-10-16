import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppSession,
  CreateSaleInput,
  CreatePurchaseInput,
  SaleRecord,
  PurchaseRecord,
} from "./api";
import { projectOffline, type LocalRecord, type OfflineSnapshot } from "./offline-model";
import { buildOfflineTransaction } from "./offline-transactions";
const disk = vi.hoisted(() => new Map<string, string>());
const fault = vi.hoisted(() => ({ storage: false }));
vi.mock("./offline-storage", () => ({
  readOfflineState: async (scope: string) => disk.get(scope) ?? null,
  writeOfflineState: async (scope: string, value: string) => {
    if (fault.storage) throw new Error("Storage full");
    disk.set(scope, value);
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));

const session = { user: { id: "cashier" }, businessId: "shop" } as AppSession;
const sale = (id = "request_sale_1", quantity = "2"): CreateSaleInput => ({
  requestId: id,
  customerId: "customer",
  saleDate: "2026-10-16T10:00:00Z",
  paymentMethod: "CASH",
  amountPaid: "23.60",
  items: [{ productId: "product", quantity, sellingPrice: "10.00" }],
});
const purchase = (id = "request_purchase_1"): CreatePurchaseInput => ({
  requestId: id,
  supplierId: "supplier",
  purchaseDate: "2026-10-16T10:00:00Z",
  amountPaid: "0",
  items: [{ productId: "product", quantity: "4", purchasePrice: "5.00" }],
});

describe("Durable offline transactions", () => {
  let api: typeof import("./offline-catalog");
  let snapshot: OfflineSnapshot;
  let online: boolean, loseResponse: boolean, rejectSale: boolean;
  let sent: { path: string; input: Record<string, unknown> }[];
  const transport = async <T>(
    path: string,
    options: RequestInit,
  ): Promise<T> => {
    if (!online) throw new TypeError("Offline");
    if (path === "/sync/snapshot")
      return JSON.parse(JSON.stringify(snapshot)) as T;
    const input = JSON.parse(String(options.body));
    sent.push({ path, input });
    if (path === "/sync/push") {
      const record = {
        ...input.payload,
        id: input.entityId,
        revision: 1,
        status: "ACTIVE",
      } as LocalRecord;
      if (input.entity === "customers") snapshot.customers.push(record);
      return { record } as T;
    }
    if (rejectSale && path === "/sales")
      throw Object.assign(new Error("Insufficient server stock"), {
        status: 409,
      });
    const kind = path === "/sales" ? "sale" : "purchase";
    const collection = kind === "sale" ? snapshot.sales : snapshot.purchases;
    const duplicate = collection.find(
      (record) => record.requestId === input.requestId,
    );
    if (duplicate) return duplicate as T;
    const built = buildOfflineTransaction(snapshot, kind, input);
    const record = {
      ...built.record,
      id: `server_${input.requestId}`,
      syncState: undefined,
      ...(kind === "sale" ? { invoiceNumber: "INV-001" } : {}),
    };
    if (kind === "sale") snapshot.sales.push(record as SaleRecord);
    else snapshot.purchases.push(record as PurchaseRecord);
    for (const movement of built.movements)
      snapshot.inventory.find(
        (stock) => stock.productId === movement.productId,
      )!.quantity =
        Number(
          snapshot.inventory.find(
            (stock) => stock.productId === movement.productId,
          )!.quantity,
        ) + movement.quantity;
    if (loseResponse) {
      loseResponse = false;
      throw new TypeError("Response lost after commit");
    }
    return record as T;
  };
  beforeEach(async () => {
    vi.resetModules();
    disk.clear();
    fault.storage = false;
    online = true;
    loseResponse = false;
    rejectSale = false;
    sent = [];
    snapshot = {
      schemaVersion: 1,
      business: { id: "shop", name: "Shop" },
      access: { role: "OWNER", membersCanViewPurchasePrice: true },
      downloadedAt: "2026-10-16T00:00:00Z",
      products: [
        {
          id: "product",
          name: "Product",
          sku: "SKU",
          unit: "PIECE",
          sellingPrice: "10.00",
          purchasePrice: "5.00",
          gstRate: "18",
          status: "ACTIVE",
          revision: 1,
        } as LocalRecord,
      ],
      customers: [
        {
          id: "customer",
          name: "Customer",
          status: "ACTIVE",
          revision: 1,
        } as LocalRecord,
      ],
      suppliers: [
        {
          id: "supplier",
          name: "Supplier",
          status: "ACTIVE",
          revision: 1,
        } as LocalRecord,
      ],
      inventory: [{ productId: "product", quantity: "10" }],
      inventoryActivity: [],
      sales: [],
      purchases: [],
    };
    api = await import("./offline-catalog");
    api.configureOffline(transport, () => session);
    await api.offlineView(session);
    online = false;
  });
  it("persists sale, exact GST and stock atomically, survives restart, then confirms one invoice", async () => {
    const saved = await api.saveOfflineTransaction(session, "sale", sale());
    await api.syncOffline(session);
    expect(saved).toMatchObject({
      syncState: "pending",
      subtotal: "20.00",
      taxTotal: "3.60",
      total: "23.60",
      invoiceNumber: null,
    });
    expect((await api.offlineView(session)).inventory[0].quantity).toBe(8);
    vi.resetModules();
    api = await import("./offline-catalog");
    api.configureOffline(transport, () => session);
    expect((await api.offlineView(session)).sales[0].requestId).toBe(
      sale().requestId,
    );
    online = true;
    await api.syncOffline(session, true);
    expect(await api.offlineCommands(session)).toHaveLength(0);
    const view = await api.offlineView(session);
    expect(view.sales).toHaveLength(1);
    expect(view.sales[0]).toMatchObject({
      id: "server_request_sale_1",
      invoiceNumber: "INV-001",
    });
    expect(view.sales[0].syncState).toBeUndefined();
    expect(view.inventory[0].quantity).toBe(8);
    expect(sent[0].input).toMatchObject({
      requestId: "request_sale_1",
      expectedTotal: "23.60",
    });
  });
  it("deduplicates local retries and prevents overselling stock reserved by earlier device bills", async () => {
    await api.saveOfflineTransaction(session, "sale", sale());
    await api.syncOffline(session);
    await api.saveOfflineTransaction(session, "sale", sale());
    await api.syncOffline(session);
    expect((await api.offlineView(session)).inventory[0].quantity).toBe(8);
    expect(await api.offlineCommands(session)).toHaveLength(1);
    await expect(
      api.saveOfflineTransaction(session, "sale", {
        ...sale("request_sale_2", "9"),
        amountPaid: "0",
      }),
    ).rejects.toThrow("Insufficient stock");
  });
  it("reconciles a lost response from a fresh snapshot without applying stock or posting twice", async () => {
    await api.saveOfflineTransaction(session, "sale", sale());
    await api.syncOffline(session);
    online = true;
    loseResponse = true;
    await api.syncOffline(session, true);
    expect(await api.offlineCommands(session)).toHaveLength(1);
    await api.syncOffline(session, true);
    expect(await api.offlineCommands(session)).toHaveLength(0);
    expect(sent.filter((request) => request.path === "/sales")).toHaveLength(1);
    expect((await api.offlineView(session)).inventory[0].quantity).toBe(8);
  });
  it("queues purchase stock before a dependent sale and uploads them in order", async () => {
    await api.saveOfflineTransaction(session, "purchase", purchase());
    await api.syncOffline(session);
    await api.saveOfflineTransaction(session, "sale", {
      ...sale("request_sale_2", "12"),
      amountPaid: "0",
    });
    await api.syncOffline(session);
    expect((await api.offlineView(session)).inventory[0].quantity).toBe(2);
    online = true;
    await api.syncOffline(session, true);
    expect(sent.map((request) => request.path)).toEqual([
      "/purchases",
      "/sales",
    ]);
    expect((await api.offlineView(session)).inventory[0].quantity).toBe(2);
  });
  it("uploads an offline-created customer before the bill that references it", async () => {
    const customer = await api.saveOfflineCatalog(session, "customers", {
      name: "New customer",
    });
    await api.syncOffline(session);
    await api.saveOfflineTransaction(session, "sale", {
      ...sale(),
      customerId: customer.id,
    });
    await api.syncOffline(session);
    online = true;
    await api.syncOffline(session, true);
    expect(sent.map((request) => request.path)).toEqual([
      "/sync/push",
      "/sales",
    ]);
    expect(await api.offlineCommands(session)).toHaveLength(0);
  });
  it("retains rejected bills and stock reservations, blocks dependent bills, and retries the same request", async () => {
    await api.saveOfflineTransaction(session, "sale", sale());
    await api.syncOffline(session);
    await api.saveOfflineTransaction(session, "sale", sale("request_sale_2"));
    await api.syncOffline(session);
    online = true;
    rejectSale = true;
    await api.syncOffline(session, true);
    const commands = await api.offlineCommands(session);
    expect(commands[0]).toMatchObject({
      state: "conflict",
      error: "Insufficient server stock",
    });
    expect(commands[1].state).toBe("pending");
    expect(sent.filter((request) => request.path === "/sales")).toHaveLength(1);
    expect((await api.offlineView(session)).inventory[0].quantity).toBe(6);
    rejectSale = false;
    await api.retryOfflineConflict(session, commands[0].operationId);
    await api.syncOffline(session, true);
    expect(await api.offlineCommands(session)).toHaveLength(0);
    expect(
      sent
        .filter((request) => request.path === "/sales")
        .map((request) => request.input.requestId),
    ).toEqual(["request_sale_1", "request_sale_1", "request_sale_2"]);
  });
  it("stops changed tax and selling options for review before upload", async () => {
    await api.saveOfflineTransaction(session, "sale", sale());
    await api.syncOffline(session);
    snapshot.products[0] = {
      ...snapshot.products[0],
      gstRate: "12",
    } as LocalRecord;
    online = true;
    await api.syncOffline(session, true);
    expect((await api.offlineCommands(session))[0].state).toBe("conflict");
    expect(sent).toHaveLength(0);
  });
  it("previews changed tax and only retries the explicitly approved updated bill", async () => {
    await api.saveOfflineTransaction(session, "sale", sale());
    await api.syncOffline(session);
    snapshot.products[0] = {
      ...snapshot.products[0],
      gstRate: "12",
    } as LocalRecord;
    online = true;
    await api.syncOffline(session, true);
    const command = (await api.offlineCommands(session))[0];
    const review = await api.prepareOfflineTransactionReview(
      session,
      command.operationId,
    );
    expect(review.record).toMatchObject({
      total: "22.40",
      amountPaid: "22.40",
    });
    expect(sent).toHaveLength(0);
    await api.applyOfflineTransactionReview(
      session,
      command.operationId,
      review.token,
    );
    await api.syncOffline(session, true);
    expect(await api.offlineCommands(session)).toHaveLength(0);
    expect(snapshot.sales[0]).toMatchObject({
      total: "22.40",
      requestId: "request_sale_1",
    });
  });
  it("does not accept a stale recalculation approval if item settings change again", async () => {
    await api.saveOfflineTransaction(session, "sale", sale());
    await api.syncOffline(session);
    snapshot.products[0] = {
      ...snapshot.products[0],
      gstRate: "12",
    } as LocalRecord;
    online = true;
    await api.syncOffline(session, true);
    const command = (await api.offlineCommands(session))[0];
    const review = await api.prepareOfflineTransactionReview(
      session,
      command.operationId,
    );
    snapshot.products[0] = {
      ...snapshot.products[0],
      gstRate: "5",
    } as LocalRecord;
    await expect(
      api.applyOfflineTransactionReview(
        session,
        command.operationId,
        review.token,
      ),
    ).rejects.toThrow("changed again");
    expect(sent).toHaveLength(0);
    expect((await api.offlineCommands(session))[0].state).toBe("conflict");
  });
  it("does not create a bill or move stock if SQLite rejects the local write", async () => {
    fault.storage = true;
    await expect(
      api.saveOfflineTransaction(session, "sale", sale()),
    ).rejects.toThrow("Storage full");
    expect((await api.offlineView(session)).sales).toHaveLength(0);
    expect((await api.offlineView(session)).inventory[0].quantity).toBe("10");
    expect(await api.offlineCommands(session)).toHaveLength(0);
  });
  it("isolates account storage and enforces roles before recording offline transactions", async () => {
    snapshot.access.role = "MEMBER";
    online = true;
    await api.syncOffline(session);
    online = false;
    await expect(
      api.saveOfflineTransaction(session, "purchase", purchase()),
    ).rejects.toThrow("administrators");
    expect(
      await api.hasOfflineBusiness({ ...session, businessId: "other" }),
    ).toBe(false);
  });
  it('converts piece and selling-option quantities into the correct stock movement', () => {
    snapshot.products[0] = { ...snapshot.products[0], unit: 'BOX', piecesPerUnit: 24 } as LocalRecord;
    snapshot.inventory[0].quantity = '1';
    const pieces = buildOfflineTransaction(snapshot, 'sale', { ...sale(), amountPaid: '0', items: [{ productId: 'product', unit: 'PIECE', quantity: '3', sellingPrice: '1.00' }] });
    expect(pieces.movements[0].quantity).toBe(-0.125);
    snapshot.products[0] = { ...snapshot.products[0], unit: 'KG', piecesPerUnit: null, sellingOptions: [{ id: 'half-kg', name: 'Half kg', unit: 'KG', quantity: '0.5', sellingPrice: '12.00' }] } as LocalRecord;
    snapshot.inventory[0].quantity = '10';
    const options = buildOfflineTransaction(snapshot, 'sale', { ...sale(), amountPaid: '0', items: [{ productId: 'product', sellingOptionId: 'half-kg', quantity: '2', sellingPrice: '1.00' }] });
    expect(options.movements[0].quantity).toBe(-1);
    expect(options.record).toMatchObject({ total: '28.32' });
  });
  it('upgrades an existing catalog database without losing queued transactions', async () => {
    await api.saveOfflineTransaction(session, 'sale', sale()); await api.syncOffline(session);
    for (const [key, value] of disk.entries()) { const previous = JSON.parse(value); previous.version = 1; disk.set(key, JSON.stringify(previous)); }
    vi.resetModules(); api = await import('./offline-catalog'); api.configureOffline(transport, () => session);
    expect((await api.offlineView(session)).sales).toHaveLength(1);
    expect([...disk.values()].map((value) => JSON.parse(value).version)).toEqual([2]);
  });
  it('does not republish unchanged sync status when a subscribed screen reads the outbox', async () => {
    const listener = vi.fn(); const unsubscribe = api.subscribeSyncStatus(listener);
    await api.offlineCommands(session); await api.offlineView(session); await api.offlineCommands(session);
    expect(listener).not.toHaveBeenCalled(); unsubscribe();
  });
  it('redacts pending purchase costs after a downloaded role change', () => {
    const built = buildOfflineTransaction(snapshot, 'purchase', purchase());
    const view = projectOffline({ version: 2, snapshot: { ...snapshot, access: { role: 'MEMBER', membersCanViewPurchasePrice: false } }, commands: [{ operationId: 'op', entityId: built.record.id, entity: 'purchase', action: 'create', payload: {}, localRecord: built.record, movements: built.movements, state: 'pending', attempts: 0, retryAt: 0 }] });
    expect(view.purchases[0].total).toBeUndefined(); expect(view.purchases[0].amountPaid).toBeUndefined(); expect(view.purchases[0].items[0].purchasePrice).toBeUndefined();
  });
  it('Sync now recovers an old persisted backend-version rejection with the original bill identity', async () => {
    await api.saveOfflineTransaction(session, 'sale', sale()); await api.syncOffline(session);
    for (const [key, value] of disk.entries()) {
      const saved = JSON.parse(value); saved.commands[0].state = 'conflict'; saved.commands[0].error = 'property expectedTotal should not exist'; disk.set(key, JSON.stringify(saved));
    }
    vi.resetModules(); api = await import('./offline-catalog'); api.configureOffline(transport, () => session);
    expect((await api.offlineCommands(session))[0].error).toContain('Backend update required');
    online = true; await api.syncOffline(session, true);
    expect(await api.offlineCommands(session)).toHaveLength(0);
    expect(sent.filter((request) => request.path === '/sales').map((request) => request.input.requestId)).toEqual(['request_sale_1']);
    expect(sent[0].input.expectedTotal).toBe('23.60');
  });
  it('keeps backend-version failures retryable without dropping total validation or duplicating a bill', async () => {
    await api.saveOfflineTransaction(session, 'sale', sale()); await api.syncOffline(session);
    let legacyServer = true;
    api.configureOffline(async <T>(path: string, options: RequestInit): Promise<T> => {
      if (path === '/sales' && legacyServer) throw Object.assign(new Error('property expectedTotal should not exist'), { status: 422 });
      return transport<T>(path, options);
    }, () => session);
    online = true; await api.syncOffline(session, true);
    expect((await api.offlineCommands(session))[0]).toMatchObject({ state: 'pending', payload: { expectedTotal: '23.60', requestId: 'request_sale_1' } });
    expect(api.getSyncStatus().message).toContain('Backend update required');
    expect(api.getSyncStatus().online).toBe(true);
    legacyServer = false; await api.syncOffline(session, true);
    expect(await api.offlineCommands(session)).toHaveLength(0);
    expect(snapshot.sales).toHaveLength(1); expect(snapshot.inventory[0].quantity).toBe(8);
  });
  it("uses exact half-up cents for fractional quantities and rejects fractional pieces", () => {
    snapshot.products[0] = {
      ...snapshot.products[0],
      unit: "KG",
      gstRate: "18",
    } as LocalRecord;
    const built = buildOfflineTransaction(snapshot, "sale", {
      ...sale(),
      amountPaid: "0",
      items: [
        { productId: "product", quantity: "0.005", sellingPrice: "1.00" },
      ],
    });
    expect(built.record).toMatchObject({
      subtotal: "0.01",
      taxTotal: "0.00",
      total: "0.01",
    });
    snapshot.products[0] = {
      ...snapshot.products[0],
      unit: "PIECE",
    } as LocalRecord;
    expect(() =>
      buildOfflineTransaction(snapshot, "sale", {
        ...sale(),
        items: [{ productId: "product", quantity: "0.5", sellingPrice: "1" }],
      }),
    ).toThrow("whole");
  });
});
