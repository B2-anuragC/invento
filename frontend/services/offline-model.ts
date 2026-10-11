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
  operationId: string; entityId: string; entity: CatalogEntity | 'opening-stock'; action: 'create' | 'update';
  baseRevision?: number; payload: Record<string, unknown>; localRecord: LocalRecord | InventoryRecord;
  state: 'pending' | 'conflict'; error?: string; attempts: number; retryAt: number;
};
export type OfflineState = { version: 1; accessBlocked?: boolean; snapshot: OfflineSnapshot; commands: OfflineCommand[] };
export const offlineScope = (session: AppSession) => `${session.user.id}:${session.businessId}`;
export function projectOffline(state: OfflineState): OfflineSnapshot {
  const view: OfflineSnapshot = JSON.parse(JSON.stringify(state.snapshot));
  for (const command of state.commands) {
    if (command.entity === 'opening-stock') {
      const stock = command.localRecord as InventoryRecord;
      view.inventory = view.inventory.filter((record) => record.productId !== stock.productId).concat(stock);
      const product = view.products.find((record) => record.id === stock.productId) as ProductRecord | undefined;
      if (product) view.inventoryActivity.unshift({ id: command.operationId, productId: stock.productId, type: 'OPENING_STOCK', quantity: stock.quantity, balanceAfter: stock.quantity, createdAt: stock.createdAt ?? '', product });
    } else {
      const record = { ...command.localRecord, syncState: command.state } as LocalRecord;
      view[command.entity] = view[command.entity].filter((entry) => entry.id !== command.entityId).concat(record);
    }
  }
  if (view.access.role === 'MEMBER' && !view.access.membersCanViewPurchasePrice) {
    view.products = view.products.map((record) => { const { purchasePrice: _price, ...visible } = record as ProductRecord & LocalRecord; return visible as LocalRecord; });
  }
  return view;
}
export function nextReadyCommand(state: OfflineState, now: number) {
  return state.commands.find((command, index) => command.state === 'pending' && command.retryAt <= now && !state.commands.slice(0, index).some((earlier) => earlier.entityId === command.entityId || (command.entity === 'opening-stock' && earlier.entityId === command.payload.productId)));
}
export function acknowledgeCommand(state: OfflineState, operationId: string, record: LocalRecord | InventoryRecord) {
  const command = state.commands.find((entry) => entry.operationId === operationId);
  if (!command) return;
  if (command.entity === 'opening-stock') {
    const stock = record as InventoryRecord;
    state.snapshot.inventory = state.snapshot.inventory.filter((entry) => entry.productId !== stock.productId).concat(stock);
    const product = state.snapshot.products.find((entry) => entry.id === stock.productId) as ProductRecord | undefined;
    if (product) state.snapshot.inventoryActivity.unshift({ id: operationId, productId: stock.productId, type: 'OPENING_STOCK', quantity: stock.quantity, balanceAfter: stock.quantity, createdAt: stock.createdAt ?? '', product });
  } else {
    state.snapshot[command.entity] = state.snapshot[command.entity].filter((entry) => entry.id !== command.entityId).concat(record as LocalRecord);
  }
  state.commands = state.commands.filter((entry) => entry.operationId !== operationId);
}
