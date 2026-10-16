import type { ProductExpectation, StockMovement, TransactionRecord } from './offline-transactions';
import type { AppSession, CustomerRecord, InventoryActivityRecord, InventoryRecord, PricingAccess, ProductRecord, SupplierRecord, SaleRecord, PurchaseRecord } from './api';
export type CatalogEntity = 'products' | 'customers' | 'suppliers';
export type LocalRecord = (ProductRecord | CustomerRecord | SupplierRecord) & { revision: number; updatedAt: string; createdAt?: string; syncState?: 'pending' | 'conflict'; };
export type OfflineSnapshot = {
  sales: SaleRecord[]; purchases: PurchaseRecord[];
  schemaVersion: 1; business: { id: string; name: string }; access: PricingAccess;
  products: LocalRecord[]; customers: LocalRecord[]; suppliers: LocalRecord[];
  inventory: InventoryRecord[]; inventoryActivity: InventoryActivityRecord[]; downloadedAt: string;
};
export type OfflineCommand = {
  operationId: string; entityId: string; entity: CatalogEntity | 'opening-stock' | 'sale' | 'purchase'; action: 'create' | 'update';
  baseRevision?: number; payload: Record<string, unknown>; localRecord: LocalRecord | InventoryRecord | TransactionRecord;
  movements?: StockMovement[]; expectations?: ProductExpectation[];
  state: 'pending' | 'conflict'; error?: string; attempts: number; retryAt: number;
};
export type OfflineState = { version: 1 | 2; accessBlocked?: boolean; snapshot: OfflineSnapshot; commands: OfflineCommand[] };
export const offlineScope = (session: AppSession) => `${session.user.id}:${session.businessId}`;
export function projectOffline(state: OfflineState): OfflineSnapshot {
  const view: OfflineSnapshot = JSON.parse(JSON.stringify(state.snapshot));
  for (const command of state.commands) {
    if (isTransactionCommand(command)) {
      const kind = command.entity === 'sale' ? 'sales' : 'purchases';
      const record = { ...command.localRecord, syncState: command.state, syncError: command.error } as TransactionRecord;
      // A server commit may already be present after a lost response. Never apply it twice.
      if (view[kind].some((entry) => entry.requestId === record.requestId)) continue;
      if (kind === 'sales') view.sales.push(record as SaleRecord); else view.purchases.push(record as PurchaseRecord);
      for (const movement of command.movements ?? []) {
        const stock = view.inventory.find((entry) => entry.productId === movement.productId);
        const balance = Number(stock?.quantity ?? 0) + movement.quantity;
        if (stock) stock.quantity = balance; else view.inventory.push({ productId: movement.productId, quantity: balance });
        const product = view.products.find((entry) => entry.id === movement.productId) as ProductRecord | undefined;
        if (product) view.inventoryActivity.unshift({ id: `${command.operationId}_${movement.productId}`, productId: product.id, type: command.entity === 'sale' ? 'SALE' : 'PURCHASE', quantity: Math.abs(movement.quantity), balanceAfter: balance, createdAt: 'saleDate' in record ? record.saleDate : record.purchaseDate, note: `Pending sync · ${command.entity}`, product });
      }
    } else if (command.entity === 'opening-stock') {
      const stock = command.localRecord as InventoryRecord;
      view.inventory = view.inventory.filter((record) => record.productId !== stock.productId).concat(stock);
      const product = view.products.find((record) => record.id === stock.productId) as ProductRecord | undefined;
      if (product) view.inventoryActivity.unshift({ id: command.operationId, productId: stock.productId, type: 'OPENING_STOCK', quantity: stock.quantity, balanceAfter: stock.quantity, createdAt: stock.createdAt ?? '', product });
    } else {
      const record = { ...command.localRecord, syncState: command.state } as LocalRecord;
      view[command.entity as CatalogEntity] = view[command.entity as CatalogEntity].filter((entry) => entry.id !== command.entityId).concat(record);
    }
  }
  if (view.access.role === 'MEMBER' && !view.access.membersCanViewPurchasePrice) {
    view.purchases = view.purchases.map((record) => { const { total: _total, subtotal: _subtotal, taxTotal: _tax, amountPaid: _paid, payments: _payments, attachment: _attachment, ...visible } = record; return { ...visible, items: record.items.map((item) => { const { purchasePrice: _price, lineTotal: _line, taxAmount: _amount, ...rest } = item; return rest; }) }; });
    view.products = view.products.map((record) => { const { purchasePrice: _price, ...visible } = record as ProductRecord & LocalRecord; return visible as LocalRecord; });
  }
  return view;
}
export const isTransactionCommand = (command: OfflineCommand) => command.entity === 'sale' || command.entity === 'purchase';
function dependencies(command: OfflineCommand): string[] {
  if (isTransactionCommand(command)) return [String(command.payload.customerId ?? command.payload.supplierId), ...(command.movements ?? []).map((entry) => entry.productId)];
  if (command.entity === 'opening-stock') return [String(command.payload.productId)];
  return [command.entityId];
}
export function nextReadyCommand(state: OfflineState, now: number) {
  return state.commands.find((command, index) => command.state === 'pending' && command.retryAt <= now && !state.commands.slice(0, index).some((earlier) => earlier.entityId === command.entityId || dependencies(earlier).some((id) => dependencies(command).includes(id))));
}
export function reconcileTransactions(state: OfflineState) {
  state.commands = state.commands.filter((command) => !isTransactionCommand(command) || !(command.entity === 'sale' ? state.snapshot.sales : state.snapshot.purchases).some((record) => record.requestId === command.payload.requestId));
}
export function acknowledgeCommand(state: OfflineState, operationId: string, record: LocalRecord | InventoryRecord) {
  const command = state.commands.find((entry) => entry.operationId === operationId);
  if (!command || isTransactionCommand(command)) return;
  if (command.entity === 'opening-stock') {
    const stock = record as InventoryRecord;
    state.snapshot.inventory = state.snapshot.inventory.filter((entry) => entry.productId !== stock.productId).concat(stock);
    const product = state.snapshot.products.find((entry) => entry.id === stock.productId) as ProductRecord | undefined;
    if (product) state.snapshot.inventoryActivity.unshift({ id: operationId, productId: stock.productId, type: 'OPENING_STOCK', quantity: stock.quantity, balanceAfter: stock.quantity, createdAt: stock.createdAt ?? '', product });
  } else {
    state.snapshot[command.entity as CatalogEntity] = state.snapshot[command.entity as CatalogEntity].filter((entry) => entry.id !== command.entityId).concat(record as LocalRecord);
  }
  state.commands = state.commands.filter((entry) => entry.operationId !== operationId);
}
