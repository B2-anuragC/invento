import { beforeEach, expect, it, vi } from "vitest";
import type { AppSession } from "./api";
import type { OfflineSnapshot } from "./offline-model";
const disk = vi.hoisted(() => new Map<string, string>());
const fault = vi.hoisted(() => ({ write: false }));
vi.mock("./offline-storage", () => ({
  readOfflineState: async (key: string) => disk.get(key) ?? null,
  writeOfflineState: async (key: string, value: string) => {
    if (fault.write) throw new Error("Storage full");
    disk.set(key, value);
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
let api: typeof import("./local-api");
let session: AppSession;
const send = <T>(path: string, body?: unknown) =>
  api.localRequest<T>(
    path,
    body ? { method: "POST", body: JSON.stringify(body) } : { method: "GET" },
    session,
  );
beforeEach(async () => {
  vi.resetModules();
  disk.clear();
  fault.write = false;
  api = await import("./local-api");
  session = await api.localSession();
});
async function setup() {
  const business = await send<{ id: string }>("/businesses", {
    name: "My shop",
    slug: "my-shop",
  });
  session.businessId = business.id;
  for (const [entity, entityId, payload] of [
    [
      "products",
      "product",
      {
        name: "Product",
        sku: "SKU",
        status: "ACTIVE",
        unit: "PIECE",
        sellingPrice: "10.00",
        purchasePrice: "5.00",
        minimumStock: "0",
        gstRate: "18",
      },
    ],
    ["customers", "customer", { name: "Customer" }],
    ["suppliers", "supplier", { name: "Supplier" }],
    ["opening-stock", "stock", { productId: "product", quantity: "10" }],
  ] as const)
    await send("/sync/push", {
      operationId: `create-${entityId}`,
      entity,
      entityId,
      action: "create",
      payload,
    });
}
it("starts a fresh local business without a login, server or network and persists it after restart", async () => {
  expect(await send("/businesses")).toEqual([]);
  await setup();
  vi.resetModules();
  api = await import("./local-api");
  expect(
    (await send<OfflineSnapshot>("/sync/snapshot")).inventory[0].quantity,
  ).toBe("10");
  expect(await send("/businesses")).toMatchObject([
    { role: 'OWNER', business: { name: "My shop" } },
  ]);
});
it("records local sales and purchases once, updates stock, numbers them per financial year, and records later payments", async () => {
  await setup();
  const input = {
    requestId: "local_sale_request",
    customerId: "customer",
    saleDate: "2026-10-16T10:00:00Z",
    paymentMethod: "CASH",
    amountPaid: "10",
    expectedTotal: "23.60",
    items: [{ productId: "product", quantity: "2", sellingPrice: "10.00" }],
  };
  const sale = await send<any>("/sales", input);
  await send("/sales", input);
  expect(sale).toMatchObject({ documentNumber: "INV/2026-27/0001", financialYear: "2026-27", documentSeq: 1 });
  expect(sale.invoiceNumber).toBeNull();
  expect(sale.syncState).toBeUndefined();
  const purchase = await send<any>("/purchases", {
    requestId: "local_purchase_request",
    supplierId: "supplier",
    purchaseDate: input.saleDate,
    amountPaid: "0",
    items: [{ productId: "product", quantity: "4", purchasePrice: "5.00" }],
  });
  expect(purchase.documentNumber).toBe("PUR/2026-27/0001");
  const payment = { requestId: "payment_1", amount: "13.60", method: "UPI" };
  await send(`/sales/${sale.id}/payments`, payment);
  await send(`/sales/${sale.id}/payments`, payment);
  const view = await send<OfflineSnapshot>("/sync/snapshot");
  expect(view.sales).toHaveLength(1);
  expect(view.sales[0].amountPaid).toBe(23.6);
  expect(view.sales[0].payments).toHaveLength(1);
  expect(view.inventory[0].quantity).toBe(12);
});
it("numbers device bills consecutively, by financial year, and keeps counting after a restart", async () => {
  await setup();
  const sale = (requestId: string, saleDate: string) => send<any>("/sales", {
    requestId, customerId: "customer", saleDate, paymentMethod: "CASH", amountPaid: "0",
    items: [{ productId: "product", quantity: "1", sellingPrice: "10" }],
  });
  expect((await sale("local_request_a", "2026-10-16T10:00:00Z")).documentNumber).toBe("INV/2026-27/0001");
  expect((await sale("local_request_b", "2026-03-31T18:29:00Z")).documentNumber).toBe("INV/2025-26/0001");
  vi.resetModules();
  api = await import("./local-api");
  expect((await sale("local_request_c", "2026-10-17T10:00:00Z")).documentNumber).toBe("INV/2026-27/0002");
  fault.write = true;
  await expect(sale("local_request_d", "2026-10-17T10:00:00Z")).rejects.toThrow("Storage full");
  fault.write = false;
  expect((await sale("local_request_e", "2026-10-17T10:00:00Z")).documentNumber).toBe("INV/2026-27/0003");
});
it("does not store a local transaction or stock movement when durable storage fails", async () => {
  await setup();
  fault.write = true;
  await expect(
    send("/sales", {
      requestId: "local_sale_request",
      customerId: "customer",
      saleDate: "2026-10-16",
      paymentMethod: "CASH",
      amountPaid: "0",
      items: [{ productId: "product", quantity: "2", sellingPrice: "10" }],
    }),
  ).rejects.toThrow("Storage full");
  fault.write = false;
  const view = await send<OfflineSnapshot>("/sync/snapshot");
  expect(view.sales).toHaveLength(0);
  expect(view.inventory[0].quantity).toBe("10");
});
it("refuses unsupported server features instead of making a network request", async () => {
  await setup();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  try {
    await expect(send("/unsupported")).rejects.toThrow("local-only");
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});
