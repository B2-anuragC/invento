import { formatQuantity } from './format';

// After a product is created the app returns to the catalog list. The product
// screen hands the new product over here and the catalog picks it up when it
// regains focus, so it can say "Product added" and show the product first.

export type AddedProduct = { id: string; name: string; notice: string };

let pending: AddedProduct | null = null;

export function sendAddedProduct(product: AddedProduct): void {
  pending = product;
}

/** Returns and clears the product added since the catalog was last shown. */
export function receiveAddedProduct(): AddedProduct | null {
  const product = pending;
  pending = null;
  return product;
}

/**
 * Checks the optional opening stock typed on the create form. Empty means none.
 * Mirrors the server: up to nine digits and three decimals, and whole pieces for
 * products counted in pieces or in boxes and packs of a known size.
 */
export function openingStockError(value: string, unit: string, piecesPerUnit?: number | null): string {
  if (value === '') return '';
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(value)) return 'Enter the opening stock as a number with up to three decimal places.';
  const quantity = Number(value);
  if (unit === 'PIECE' && !Number.isInteger(quantity)) return 'Enter the opening stock as a whole number of pieces.';
  if (piecesPerUnit && Math.abs(quantity * piecesPerUnit - Math.round(quantity * piecesPerUnit)) > 1e-8) return 'The opening stock must be a whole number of pieces.';
  return '';
}

/** What the catalog says about a product just created, including how its opening stock went. */
export function addedProductNotice(
  name: string,
  unit: string,
  opening: { quantity: string; error?: string } | null,
  canRecordStock: boolean,
): string {
  const added = `Product added: ${name}.`;
  if (opening?.error) return `${added} The opening stock was not recorded (${opening.error}). Open the product to record it.`;
  if (opening) return `${added} Opening stock ${formatQuantity(Number(opening.quantity), unit)}.`;
  return canRecordStock ? `${added} Open it to record its opening stock before selling it.` : added;
}
