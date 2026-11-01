import { DEFAULT_DOCUMENT_PREFIX, DEFAULT_ROLE_PERMISSIONS, type DocumentSeries, DOCUMENT_PREFIX_RULE_MESSAGE, financialYearOf, formatDocumentNumber, GSTIN_RULE_MESSAGE, gstinStateCode, isValidDocumentPrefix, isValidGstin, normalizeDocumentPrefix, normalizeGstin } from '@invento/shared';
import { randomUUID } from "expo-crypto";
import { deleteOfflineState, readOfflineState, writeOfflineState } from "./offline-storage";
import { buildOfflineTransaction } from "./offline-transactions";
import type { OfflineSnapshot, LocalRecord } from "./offline-model";
import type { AppSession, ApiUser, BusinessDetails, BusinessDetailsInput, SaleRecord, PurchaseRecord } from "./api";
import { moneyValue } from "./transaction-accounting";
import { applyLocalAdjustment, localProductStock } from "./local-stock";
import { recordLocalReturn, type AllocatedNumber, type LocalBillContext } from "./local-bills";

type LocalDatabase = {
  version: 1;
  profile: ApiUser;
  businesses: { id: string; name: string; slug: string }[];
  snapshots: Record<string, OfflineSnapshot>;
  operations: Record<string, unknown>;
  /** Last invoice number per business, series and financial year, saved with each bill. */
  documentCounters?: Record<string, number>;
  /** Each business's changes in the order they were made, kept for moving a guest shop to an account. */
  journals?: Record<string, GuestJournalEntry[]>;
};

/**
 * A change made on the device, kept as the request the server would have
 * taken. Bills and notes get server ids when uploaded, so the device's ids are
 * kept to map later requests (payments, returns, edits) onto them.
 */
export type GuestJournalEntry = { seq: number; at: string; method: string; path: string; body?: unknown; localId?: string; localItemIds?: string[] };
const unjournaled = new Set(["/auth/logout", "/auth/me", "/sync/snapshot"]);

/** Adds a successful change to its business's journal, in the same storage write as the change. */
function journal(state: LocalDatabase, method: string, path: string, body: unknown, result: unknown, businessId: string) {
  if (method === "GET" || unjournaled.has(path) || !businessId) return;
  const entries = ((state.journals ??= {})[businessId] ??= []);
  const record = result as { id?: unknown; items?: { id?: unknown }[] } | null;
  const billLike = /^\/(sales|purchases)(\/|$)/.test(path) || path === "/businesses";
  entries.push({
    seq: entries.length + 1,
    at: new Date().toISOString(),
    method,
    path,
    ...(body === undefined || (typeof body === "object" && body !== null && !Object.keys(body).length) ? {} : { body }),
    ...(billLike && typeof record?.id === "string" ? { localId: record.id } : {}),
    ...(billLike && Array.isArray(record?.items) ? { localItemIds: record.items.map((item) => String(item.id)) } : {}),
  });
}

/** Deletes everything kept by the device-only handler and returns the ids of the businesses it held. */
export async function deleteLocalDatabase(): Promise<string[]> {
  const work = writes.catch(() => {}).then(async () => {
    const ids = (await load()).businesses.map((business) => business.id);
    await deleteOfflineState(key);
    return ids;
  });
  writes = work;
  return work;
}

/** The changes recorded for a business on this device, oldest first. */
export async function guestJournal(businessId: string): Promise<GuestJournalEntry[]> {
  await writes.catch(() => {});
  return clone((await load()).journals?.[businessId] ?? []);
}
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
const invalid = (message: string) => Object.assign(new Error(message), { status: 422 });
/** Shop details on a local-only device, checked with the same rules as the server. */
function updatedLocalBusiness(current: BusinessDetails, input: BusinessDetailsInput): BusinessDetails {
  const text = (value: string | undefined, previous: string | null | undefined) => (value === undefined ? previous : value.trim() || null);
  const next: BusinessDetails = { ...current, email: text(input.email, current.email), phone: text(input.phone, current.phone), address: text(input.address, current.address) };
  if (input.name !== undefined) {
    if (input.name.trim().length < 2) throw invalid("Enter the shop name (at least 2 characters).");
    next.name = input.name.trim();
  }
  if (input.gstin !== undefined) {
    const gstin = normalizeGstin(input.gstin);
    if (gstin && !isValidGstin(gstin)) throw invalid(GSTIN_RULE_MESSAGE);
    next.gstin = gstin || null;
  }
  if (input.stateCode !== undefined) next.stateCode = input.stateCode.trim() || null;
  if (next.gstin) next.stateCode = gstinStateCode(next.gstin);
  for (const key of ["invoicePrefix", "purchasePrefix"] as const) {
    if (input[key] === undefined) continue;
    const prefix = normalizeDocumentPrefix(input[key]!);
    if (!isValidDocumentPrefix(prefix)) throw invalid(DOCUMENT_PREFIX_RULE_MESSAGE);
    next[key] = prefix;
  }
  return next;
}

/**
 * The next number in a series for the date's financial year. The counter is
 * written in the same storage write as the document, and a retried request
 * returns before numbering, so numbers are consecutive like the server's.
 */
function allocateNumber(state: LocalDatabase, snapshot: OfflineSnapshot, series: DocumentSeries, date: string): AllocatedNumber {
  const financialYear = financialYearOf(date);
  const counterKey = `${snapshot.business.id}|${series}|${financialYear}`;
  state.documentCounters ??= {};
  const documentSeq = (state.documentCounters[counterKey] ?? 0) + 1;
  state.documentCounters[counterKey] = documentSeq;
  // Credit and debit notes always use CN and DN.
  const prefixes = snapshot.business as { invoicePrefix?: string; purchasePrefix?: string };
  const prefix = (series === "SALE" ? prefixes.invoicePrefix : series === "PURCHASE" ? prefixes.purchasePrefix : undefined) ?? DEFAULT_DOCUMENT_PREFIX[series];
  return { documentNumber: formatDocumentNumber(prefix, financialYear, documentSeq), financialYear, documentSeq };
}
const billContext = (state: LocalDatabase, snapshot: OfflineSnapshot): LocalBillContext => ({ now: new Date().toISOString(), newId: randomUUID, allocate: (series, date) => allocateNumber(state, snapshot, series, date) });

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
      } else if (/^\/businesses\/[^/]+$/.test(path)) {
        const snapshot = state.snapshots[decodeURIComponent(path.split("/")[2])];
        if (!snapshot) throw Object.assign(new Error("Business not found on this device."), { status: 404 });
        if (method === "PATCH") snapshot.business = updatedLocalBusiness(snapshot.business, input);
        const entry = state.businesses.find((business) => business.id === snapshot.business.id);
        if (entry) entry.name = snapshot.business.name;
        result = clone(snapshot.business);
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
          // The device numbers its own bills. The counter is written in the same
          // storage write as the bill, and a retried request returned above.
          const record = {
            ...built.record,
            id: randomUUID(),
            syncState: undefined,
            status: "COMPLETED",
            ...allocateNumber(state, snapshot, kind === "sale" ? "SALE" : "PURCHASE", kind === "sale" ? input.saleDate : input.purchaseDate),
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
        } else if (/^\/(sales|purchases)\/[^/]+\/returns$/.test(path) && method === "POST") {
          const [, collection, id] = path.split("/");
          // A retried return changes nothing, so it is not stored or journaled again.
          const done = (collection === "sales" ? snapshot.sales : snapshot.purchases).find((record) => (record as { returns?: { requestId?: string }[] }).returns?.some((note) => note.requestId === input.requestId));
          if (done?.id === decodeURIComponent(id)) return clone(done) as T;
          result = recordLocalReturn(snapshot, collection === "sales" ? "sale" : "purchase", decodeURIComponent(id), input, billContext(state, snapshot));
        } else if (/^\/products\/[^/]+\/stock$/.test(path) && method === "GET") {
          result = localProductStock(snapshot, decodeURIComponent(path.split("/")[2]), new Date().toISOString());
        } else if (path === "/inventory/adjustments" && method === "POST") {
          result = applyLocalAdjustment(snapshot, { ...input, id: randomUUID() }, new Date().toISOString());
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
      const businessId = path === "/businesses" ? (result as { id?: string } | null)?.id ?? "" : /^\/businesses\/[^/]+$/.test(path) ? decodeURIComponent(path.split("/")[2]) : session?.businessId ?? "";
      journal(state, method, path, input, result, businessId);
      await writeOfflineState(key, JSON.stringify(state));
      return clone(result) as T;
    });
  writes = work;
  return work;
}
