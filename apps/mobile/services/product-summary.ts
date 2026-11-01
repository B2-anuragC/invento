import { sellingUnitConversion } from '@invento/shared';
import { formatMoney, formatQuantity, unitLabel } from './format';
import type { ProductRecord, SellingOption } from './api';
import { stockBadge } from './catalog-view';

export type StockWarning = { tone: 'low' | 'out'; title: string; message: string };
export type TaxSummary = { gst: string; hsn: string | null; priceWithGst: string | null };
export type SellingOptionRow = { id: string; name: string; price: string; perUnit: string | null; stock: string | null };

/** Whole-number thousandths, so 20 − 4.9 reads 15.1 rather than 15.099999. */
const thousandths = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Warning on the product page when stock is out or below the minimum level, using the same
 * thresholds as the catalog badge. Null when stock is fine.
 */
export function stockWarning(quantity: number, minimumStock: number, unit: string): StockWarning | null {
  const badge = stockBadge(quantity, minimumStock);
  if (badge.tone === 'out') {
    return { tone: 'out', title: 'Out of stock', message: 'Nothing is left to sell. Record a purchase or adjust stock to add more.' };
  }
  if (badge.tone === 'low') {
    return {
      tone: 'low',
      title: 'Low stock',
      message: `Below the minimum level of ${formatQuantity(minimumStock, unit)}. Add ${formatQuantity(thousandths(minimumStock - quantity), unit)} to reach it.`,
    };
  }
  return null;
}

/** GST rate, HSN code and the default price with GST added, for the product page. */
export function taxSummary(product: Pick<ProductRecord, 'gstRate' | 'hsnCode' | 'sellingPrice' | 'unit'>): TaxSummary {
  const rate = Number(product.gstRate ?? 0);
  const validRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  const hsn = product.hsnCode?.trim();
  // Integer paise and basis points, rounded half up like the bill totals.
  const paise = Math.round(Number(product.sellingPrice) * 100);
  const withGst = validRate && Number.isFinite(paise) ? paise + Math.round(paise * Math.round(validRate * 100) / 10000) : null;
  return {
    gst: validRate ? `${validRate}% GST` : 'No GST (0%)',
    hsn: hsn || null,
    priceWithGst: withGst === null ? null : `${formatMoney(withGst / 100)} / ${unitLabel(product.unit)} with GST`,
  };
}

/** "1 pack = 10 pieces" for products kept in groups of pieces; null otherwise. */
export function groupSizeLabel(unit: string, piecesPerUnit: number | null | undefined): string | null {
  if (unit === 'DOZEN') return '1 dozen = 12 pieces';
  if ((unit === 'BOX' || unit === 'PACK') && piecesPerUnit) return `1 ${unitLabel(unit)} = ${formatQuantity(piecesPerUnit, 'PIECE')}`;
  return null;
}

/**
 * Read-only rows for a product's selling options: what is sold for how much, the price per unit,
 (when the option is more than one unit)
 * and how much stock one sale of the option takes when that is in another unit.
 */
export function sellingOptionRows(product: Pick<ProductRecord, 'unit' | 'piecesPerUnit'>, options: SellingOption[] | undefined): SellingOptionRow[] {
  const groupSize = product.unit === 'DOZEN' ? 12 : product.piecesPerUnit ?? null;
  return (options ?? []).map((option) => {
    const quantity = Number(option.quantity);
    const price = Number(option.sellingPrice);
    const conversion = sellingUnitConversion(product.unit, groupSize, option.unit, option.piecesPerUnit);
    let stock: string | null = null;
    if (conversion && (conversion.perOption || conversion.unit !== product.unit || option.unit !== product.unit)) {
      const movement = thousandths((conversion.perOption ? 1 : quantity) * conversion.numerator / conversion.denominator);
      stock = `Takes ${formatQuantity(movement, conversion.unit)} from stock`;
    }
    return {
      id: option.id,
      name: option.name,
      price: `${formatQuantity(quantity, option.unit)} for ${formatMoney(price)}`,
      perUnit: quantity > 0 && quantity !== 1 && !conversion?.perOption ? `${formatMoney(price / quantity)} / ${unitLabel(option.unit)}` : null,
      stock,
    };
  });
}
