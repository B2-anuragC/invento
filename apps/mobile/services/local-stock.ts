import type { StockAdjustmentRequest } from '@invento/shared';

import type { OfflineSnapshot } from './offline-model';

// Stock movements for a shop kept only on this device (adjustments, returns,
// bill edits), with the server's rules and messages (InventoryService.applyMovement). Amounts are worked out
// in thousandths, or in whole pieces for a product kept in packs, boxes or
// dozens, so they are exact like the server's decimals.

const invalid = (message: string, status = 400) => Object.assign(new Error(message), { status });
const QUANTITY_RULE = 'Inventory quantity must be finite, within range, and positive (zero is allowed for opening stock).';
// The server's inflow types (inventory.movement-types.ts); everything else takes stock out.
const inflow = new Set(['OPENING_STOCK', 'PURCHASE', 'RETURN_IN', 'ADJUSTMENT_IN']);
const adjustmentTypes = new Set(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRED']);

/** A quantity with up to three decimals in thousandths, or null when it is not one. */
function thousandths(value: string | number): number | null {
  const text = String(value).trim();
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}
const fromThousandths = (value: number) => `${Math.trunc(value / 1000)}${value % 1000 ? `.${String(value % 1000).padStart(3, '0').replace(/0+$/, '')}` : ''}`;

type LocalProduct = { id: string; unit: string; piecesPerUnit?: number | null };

/** A stock movement on the device, in the product's unit or in pieces (`unit: 'PIECE'`) for a grouped product. */
export type LocalMovementInput = { id: string; productId: string; type: string; quantity: string; unit?: string; note?: string | null; expectedQuantity?: string };

/** Applies a stock adjustment to the device snapshot and returns the stock movement, as the server would. */
export function applyLocalAdjustment(snapshot: OfflineSnapshot, input: StockAdjustmentRequest & { id: string }, now: string) {
  if (!snapshot.products.some((record) => record.id === input.productId)) throw invalid('Product not found.', 404);
  if (!adjustmentTypes.has(input.type)) throw invalid('Choose a valid adjustment type.', 422);
  if (thousandths(input.quantity) === 0) throw invalid('Adjustment quantity must be greater than zero.');
  return applyLocalMovement(snapshot, input, now);
}

/** Moves stock on the device snapshot and records the movement in its history. */
export function applyLocalMovement(snapshot: OfflineSnapshot, input: LocalMovementInput, now: string) {
  const product = snapshot.products.find((record) => record.id === input.productId) as LocalProduct | undefined;
  if (!product) throw invalid('Product not found.', 404);
  const amount = thousandths(input.quantity);
  if (amount === null || amount === 0) throw invalid(QUANTITY_RULE);
  const size = product.piecesPerUnit || null;
  if (input.unit !== undefined && input.unit !== product.unit && !(input.unit === 'PIECE' && size)) throw invalid('Unsupported inventory movement unit for this product.');
  const stock = snapshot.inventory.find((record) => record.productId === product.id);
  if (!stock) throw invalid('Opening stock must be recorded before adjustments can be made.');

  // Grouped products count in whole pieces; others in thousandths of their unit.
  const inPieces = input.unit === 'PIECE' && !!size;
  const scale = size ? 1 : 1000;
  const current = size ? Math.round(Number(stock.quantity) * size) : Math.round(Number(stock.quantity) * 1000);
  const delta = size ? (inPieces ? amount / 1000 : (amount * size) / 1000) : amount;
  if (size && !Number.isInteger(delta)) throw invalid('Grouped stock must represent a whole number of pieces.');

  if (input.expectedQuantity !== undefined) {
    const expected = thousandths(input.expectedQuantity);
    const shown = inPieces ? current * 1000 : size ? (current * 1000) / size : current;
    if (expected === null || expected !== shown) {
      const now = inPieces ? String(current) : size ? String(current / size) : fromThousandths(current);
      throw invalid(`Stock changed while you were counting: it is now ${now}${inPieces ? (current === 1 ? ' piece' : ' pieces') : ''}. Check the count and try again.`, 409);
    }
  }

  const signed = inflow.has(input.type) ? delta : -delta;
  const after = current + signed;
  if (after < 0) throw invalid('Insufficient stock for this operation.');
  if ((size ? after / size : after / scale) > 999999999.999) throw invalid('Inventory balance exceeds the supported stock quantity.');

  // The device keeps stock in the product's unit, as the server shows it.
  const toUnit = (value: number) => (size ? value / size : value / 1000);
  stock.quantity = toUnit(after);
  (stock as { updatedAt?: string }).updatedAt = now;
  const movement = {
    id: input.id,
    productId: product.id,
    product: product as never,
    type: input.type,
    quantity: toUnit(signed),
    balanceAfter: toUnit(after),
    note: input.note?.trim() || null,
    createdAt: now,
  };
  snapshot.inventoryActivity.unshift(movement as never);
  return movement;
}

/** A product's stock as the server returns it, with no dates until opening stock is recorded. */
export function localProductStock(snapshot: OfflineSnapshot, productId: string, now: string) {
  if (!snapshot.products.some((record) => record.id === productId)) throw invalid('Product not found.', 404);
  const stock = snapshot.inventory.find((record) => record.productId === productId) as { productId: string; quantity: string | number; createdAt?: string | null; updatedAt?: string | null } | undefined;
  if (!stock) return { productId, quantity: '0', createdAt: null, updatedAt: null };
  // A stock row first made by a bill has no date of its own, but stock is recorded.
  return { ...stock, createdAt: stock.createdAt ?? stock.updatedAt ?? now, updatedAt: stock.updatedAt ?? stock.createdAt ?? now };
}
