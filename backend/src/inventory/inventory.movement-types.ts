import { InventoryTransactionType } from '@prisma/client';

/**
 * Transaction types that increase stock. All other transaction types are
 * treated as outflows. This is the single source of truth for
 * inflow/outflow direction so Purchase/Sale flows (and any other future
 * caller) share identical stock-movement semantics with the Inventory
 * Engine instead of re-deriving their own rules.
 */
const INFLOW_TRANSACTION_TYPES: ReadonlySet<InventoryTransactionType> = new Set([
  InventoryTransactionType.OPENING_STOCK,
  InventoryTransactionType.PURCHASE,
  InventoryTransactionType.RETURN_IN,
  InventoryTransactionType.ADJUSTMENT_IN,
]);

export function isInflowTransaction(type: InventoryTransactionType): boolean {
  return INFLOW_TRANSACTION_TYPES.has(type);
}
