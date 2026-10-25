import { DEFAULT_ROLE_PERMISSIONS } from '@invento/shared';
import { randomUUID } from "expo-crypto";
import { readOfflineState, writeOfflineState } from "./offline-storage";
import { buildOfflineTransaction } from "./offline-transactions";
import type { OfflineSnapshot, LocalRecord } from "./offline-model";
import type { AppSession, ApiUser, SaleRecord, PurchaseRecord } from "./api";
import { moneyValue } from "./transaction-accounting";

type LocalDatabase = {
  version: 1;
  profile: ApiUser;
  businesses: { id: string; name: string; slug: string }[];
  snapshots: Record<string, OfflineSnapshot>;
  operations: Record<string, unknown>;
};
const key = "invento.standalone.v1";
let writes: Promise<unknown> = Promise.resolve();
async function load(): Promise<LocalDatabase> {
  const raw = await readOfflineState(key);
  return raw
    ? JSON.parse(raw)
    : {
        version: 1,
        profile: { id: "local-owner", name: "Owner", email: "" },
        businesses: [],
        snapshots: {},
        operations: {},
      };
}
export async function localSession(): Promise<AppSession> {
  await writes.catch(() => {});
  const state = await load();
  return {
    accessToken: "local-only",
    refreshToken: "local-only",
    businessId: "",
    user: state.profile,
  };
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
/** Device-only request handler. No fetch, credentials, cloud account or server is used. */
export function localRequest<T>(
  path: string,
  options: RequestInit,
  session?: AppSession | null,
): Promise<T> {
  const work = writes
    .catch(() => {})
    .then(async () => {
      const state = await load();
      // Device-only data never establishes authority over a server business.
      for (const snapshot of Object.values(state.snapshots)) snapshot.access.permissions = [...DEFAULT_ROLE_PERMISSIONS.OWNER];
      const input =
        typeof options.body === "string" ? JSON.parse(options.body) : {};
      const method = options.method ?? "GET";
      let result: unknown;
      if (path === "/auth/logout") return undefined as T;
      if (path === "/auth/me" && method === "PATCH") {
        state.profile = { ...state.profile, ...input, id: "local-owner" };
        result = state.profile;
      } else if (path === "/businesses" && method === "GET")
        result = state.businesses.map((business) => ({
          role: "OWNER",
          business,
        }));
      else if (path === "/businesses" && method === "POST") {
        if (state.businesses.some((entry) => entry.slug === input.slug))
          throw new Error(
            "A business with this identifier already exists on this device.",
          );
        const business = {
          id: randomUUID(),
          name: input.name,
          slug: input.slug,
        };
        state.businesses.push(business);
        state.snapshots[business.id] = {
          schemaVersion: 1,
          business: { id: business.id, name: business.name },
          access: { role: "OWNER", membersCanViewPurchasePrice: true, permissions: [...DEFAULT_ROLE_PERMISSIONS.OWNER] },
          products: [],
          customers: [],
          suppliers: [],
          inventory: [],
          inventoryActivity: [],
          sales: [],
          purchases: [],
          downloadedAt: new Date().toISOString(),
        };
        result = business;
      } else {
        const snapshot = session?.businessId
          ? state.snapshots[session.businessId]
          : undefined;
        if (!snapshot)
          throw new Error("Create or select a business on this device first.");
        if (path === "/sync/snapshot") {
          snapshot.downloadedAt = new Date().toISOString();
          result = snapshot;
        } else if (path === "/sync/push") {
          const operationKey = `${session!.businessId}:${input.operationId}`;
          if (state.operations[operationKey])
            return clone(state.operations[operationKey]) as T;
          if (input.entity === "opening-stock") {
            if (
              snapshot.inventory.some(
                (entry) => entry.productId === input.payload.productId,
              )
            )
              throw new Error("Opening stock already exists.");
            const product = snapshot.products.find(
              (entry) => entry.id === input.payload.productId,
            );
            if (!product) throw new Error("Product not found on this device.");
            result = {
              record: {
                ...input.payload,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            };
            snapshot.inventory.push((result as { record: any }).record);
            snapshot.inventoryActivity.unshift({
              id: input.operationId,
              productId: product.id,
              product: product as any,
              type: "OPENING_STOCK",
              quantity: input.payload.quantity,
              balanceAfter: input.payload.quantity,
              createdAt: new Date().toISOString(),
            });
          } else {
            if (!["products", "customers", "suppliers"].includes(input.entity))
              throw new Error("Unsupported local catalog operation.");
            const records =
              snapshot[input.entity as "products" | "customers" | "suppliers"];
            const previous = records.find(
              (entry) => entry.id === input.entityId,
            );
            if (
              input.action === "update" &&
              (!previous || previous.revision !== input.baseRevision)
            )
              throw Object.assign(
                new Error(
                  "The local record changed. Review it before retrying.",
                ),
                { status: 409 },
              );
            const record = {
              status: "ACTIVE",
              ...previous,
              ...input.payload,
              id: input.entityId,
              revision: (previous?.revision ?? 0) + 1,
              createdAt: previous?.createdAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as LocalRecord;
            snapshot[input.entity as "products" | "customers" | "suppliers"] =
              records.filter((entry) => entry.id !== record.id).concat(record);
            result = { record };
          }
          state.operations[operationKey] = result;
        } else if (
          (path === "/sales" || path === "/purchases") &&
          method === "POST"
        ) {
          const kind = path === "/sales" ? "sale" : "purchase";
          const records = kind === "sale" ? snapshot.sales : snapshot.purchases;
          const existing = records.find(
            (entry) => entry.requestId === input.requestId,
          );
          if (existing) return clone(existing) as T;
          const built = buildOfflineTransaction(snapshot, kind, input);
          if (
            input.expectedTotal !== undefined &&
            Number(built.record.total) !== Number(input.expectedTotal)
          )
            throw Object.assign(
              new Error("Item settings changed the total. Review this bill."),
              { status: 409 },
            );
          const record = {
            ...built.record,
            id: randomUUID(),
            syncState: undefined,
            ...(kind === "sale"
              ? {
                  invoiceNumber: `LOCAL-${String(snapshot.sales.length + 1).padStart(6, "0")}`,
                }
              : {}),
          };
          if (kind === "sale") snapshot.sales.push(record as SaleRecord);
          else snapshot.purchases.push(record as PurchaseRecord);
          for (const movement of built.movements) {
            let stock = snapshot.inventory.find(
              (entry) => entry.productId === movement.productId,
            );
            if (!stock) {
              stock = { productId: movement.productId, quantity: 0 };
              snapshot.inventory.push(stock);
            }
            stock.quantity = Number(stock.quantity) + movement.quantity;
            const product = snapshot.products.find(
              (entry) => entry.id === movement.productId,
            )!;
            snapshot.inventoryActivity.unshift({
              id: `${record.id}_${product.id}`,
              productId: product.id,
              product: product as any,
              type: kind === "sale" ? "SALE" : "PURCHASE",
              quantity: Math.abs(movement.quantity),
              balanceAfter: stock.quantity,
              createdAt: new Date().toISOString(),
            });
          }
          result = record;
        } else if (/^\/(sales|purchases)\/[^/]+\/payments$/.test(path)) {
          const [, collection, id] = path.split("/");
          const record = (
            collection === "sales" ? snapshot.sales : snapshot.purchases
          ).find((entry) => entry.id === id);
          if (!record) throw new Error("Transaction not found on this device.");
          const duplicate = record.payments?.some(
            (entry) => entry.id === input.requestId,
          );
          if (!duplicate) {
            const amount = Number(input.amount);
            const paid = Number(
              record.amountPaid ?? input.openingAmountPaid ?? 0,
            );
            if (
              !Number.isFinite(amount) ||
              amount <= 0 ||
              moneyValue(paid + amount) > Number(record.total)
            )
              throw new Error("Payment exceeds the remaining balance.");
            record.amountPaid = moneyValue(paid + amount);
            record.payments = [
              ...(record.payments ?? []),
              {
                id: input.requestId,
                amount: input.amount,
                method: input.method,
                kind: "PAYMENT",
                paidAt: new Date().toISOString(),
              },
            ];
          }
          result = record;
        } else if (/^\/(sales|purchases)\/[^/]+$/.test(path)) {
          const [, collection, id] = path.split("/");
          result = (
            collection === "sales" ? snapshot.sales : snapshot.purchases
          ).find((entry) => entry.id === id);
          if (!result) throw new Error("Transaction not found on this device.");
        } else if (path.endsWith("/pricing-access")) {
          if (method === "PATCH")
            snapshot.access.membersCanViewPurchasePrice = Boolean(
              input.membersCanViewPurchasePrice,
            );
          result = snapshot.access;
        } else if (path.endsWith("/users") && method === "GET")
          result = [
            {
              id: "local-owner",
              role: "OWNER",
              createdAt: new Date().toISOString(),
              user: state.profile,
            },
          ];
        else
          throw new Error(
            "This feature requires server mode and is unavailable in the local-only build.",
          );
      }
      await writeOfflineState(key, JSON.stringify(state));
      return clone(result) as T;
    });
  writes = work;
  return work;
}
