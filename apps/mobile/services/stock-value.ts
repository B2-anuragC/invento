import { moneyValue } from './transaction-accounting';

type ValuedProduct = { id: string; status: string; purchasePrice?: string | null; sellingPrice: string };

/**
 * What the stock on hand is worth, before GST: at purchase price (cost) and at
 * the default selling price, over active products. Stock is in each product's
 * own unit and prices are per that unit. The cost is null for members who
 * cannot see purchase prices, so it is never worked out from missing prices.
 */
export function stockValue(products: ValuedProduct[], inventory: { productId: string; quantity: string | number }[], canViewCost: boolean): { atCost: number | null; atSellingPrice: number } {
  const stock = new Map(inventory.map((row) => [row.productId, Number(row.quantity)]));
  let atCost = 0;
  let atSellingPrice = 0;
  for (const product of products) {
    const quantity = stock.get(product.id) ?? 0;
    if (product.status !== 'ACTIVE' || !(quantity > 0)) continue;
    atCost += quantity * Number(product.purchasePrice ?? 0);
    atSellingPrice += quantity * Number(product.sellingPrice);
  }
  return { atCost: canViewCost ? moneyValue(atCost) : null, atSellingPrice: moneyValue(atSellingPrice) };
}
