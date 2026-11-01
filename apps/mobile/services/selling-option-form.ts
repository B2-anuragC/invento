import { sellingUnitConversion } from '@invento/shared';

import type { SellingOption } from './api';
import { formatMoney, formatQuantity, unitLabel } from './format';

/**
 * The product form's selling options, written as people say them: "1 pack =
 * 10 pieces" plus a price. A pack or box is one unit holding a number of
 * pieces; a dozen is always 12; pieces and measured units (kg, m…) take a
 * quantity. Options are stored as before ({ unit, quantity, piecesPerUnit }),
 * so sales, receipts and the server work unchanged.
 */
export type OptionShape = 'group' | 'dozen' | 'count' | 'custom';

const GROUPS = ['PIECE', 'PACK', 'BOX', 'DOZEN'];
const FAMILIES = [['KG', 'GRAM'], ['LITRE', 'MILLILITRE'], ['METRE', 'FOOT']];
const isGroup = (unit: string) => GROUPS.includes(unit);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const thousandths = (value: number) => Math.round(value * 1000) / 1000;

/** Units an option can be sold in: pieces, packs, boxes and dozens for counted products; the same kind of measure otherwise. */
export function optionUnitChoices(stockUnit: string, currentUnit?: string): string[] {
  const family = isGroup(stockUnit) ? GROUPS : FAMILIES.find((units) => units.includes(stockUnit)) ?? [stockUnit];
  const choices = [stockUnit, ...family.filter((unit) => unit !== stockUnit)];
  return currentUnit && !choices.includes(currentUnit) ? [...choices, currentUnit] : choices;
}

/**
 * How the form shows an option. Older options that do not fit the simple
 * sentence are "custom" and keep their quantity field. A product stocked in
 * packs or boxes with no pieces per pack sells its own unit by count
 * ("2 packs"), since a piece count could not be used for it.
 */
export function optionShape(stockUnit: string, option: Pick<SellingOption, 'unit' | 'quantity'>, groupSize: number | null): OptionShape {
  if (!optionUnitChoices(stockUnit).includes(option.unit)) return 'custom';
  if ((stockUnit === 'PACK' || stockUnit === 'BOX') && option.unit === stockUnit && !groupSize) return 'count';
  if (isGroup(stockUnit) && (option.unit === 'PACK' || option.unit === 'BOX')) return Number(option.quantity) === 1 ? 'group' : 'custom';
  if (isGroup(stockUnit) && option.unit === 'DOZEN') return Number(option.quantity) === 1 ? 'dozen' : 'custom';
  return 'count';
}

/** Pieces in one pack or box of this option: its own size, else the product's when it is stocked in the same unit. */
export function optionPieces(option: Pick<SellingOption, 'unit' | 'piecesPerUnit'>, stockUnit: string, groupSize: number | null): number | null {
  if (option.unit === 'DOZEN') return 12;
  if (option.unit === 'PIECE') return 1;
  return option.piecesPerUnit ?? (option.unit === stockUnit ? groupSize : null);
}

/** A new option: a pack of pieces for products counted in pieces, otherwise one of the stock unit. */
export function newSellingOption(id: string, stockUnit: string): SellingOption {
  if (stockUnit === 'PIECE') return { id, name: '', unit: 'PACK', quantity: '1', sellingPrice: '' };
  return { id, name: '', unit: stockUnit, quantity: isGroup(stockUnit) ? '1' : '', sellingPrice: '' };
}

/** Switching the unit keeps the price; a pack, box or dozen is one unit, and its size starts empty. */
export function chooseOptionUnit(option: SellingOption, unit: string, stockUnit: string): SellingOption {
  const { piecesPerUnit: _size, ...rest } = option;
  const single = isGroup(stockUnit) && unit !== 'PIECE';
  const keep = isGroup(stockUnit) ? option.unit === 'PIECE' : optionShape(stockUnit, option, null) === 'count';
  return { ...rest, unit, quantity: !single && keep ? option.quantity : '1' };
}

/**
 * Older options saved as "2 packs of 10" or "2 dozen" are rewritten as one
 * pack of 20 or 24 pieces: the same price and the same stock per sale.
 */
export function normalizeSellingOptions(options: SellingOption[], stockUnit: string, groupSize: number | null): SellingOption[] {
  if (!isGroup(stockUnit)) return options;
  return options.map((option) => {
    const quantity = Number(option.quantity);
    if (quantity === 1 || !Number.isFinite(quantity) || quantity <= 0) return option;
    if (option.unit === 'DOZEN' && Number.isInteger(quantity * 12)) {
      const { piecesPerUnit: _size, ...rest } = option;
      return { ...rest, unit: 'PIECE', quantity: String(quantity * 12) };
    }
    const pieces = option.unit === 'PACK' || option.unit === 'BOX' ? optionPieces(option, stockUnit, groupSize) : null;
    const total = pieces ? thousandths(pieces * quantity) : 0;
    if (pieces && Number.isInteger(total) && total <= 100000) return { ...option, quantity: '1', piecesPerUnit: total };
    return option;
  });
}

/** The name used on bills when none is typed: "Pack of 10", "Dozen", "Single piece", "6 pieces", "5 kg". */
export function defaultOptionName(option: SellingOption, stockUnit: string, groupSize: number | null): string {
  const shape = optionShape(stockUnit, option, groupSize);
  if (shape === 'group') {
    const pieces = optionPieces(option, stockUnit, groupSize);
    return pieces ? `${capital(unitLabel(option.unit))} of ${pieces}` : capital(unitLabel(option.unit));
  }
  if (shape === 'dozen') return 'Dozen';
  const quantity = Number(option.quantity);
  if (!(quantity > 0)) return '';
  if (option.unit === 'PIECE' && quantity === 1) return 'Single piece';
  return formatQuantity(quantity, option.unit);
}

/** "Price for 1 pack", "Price for 6 pieces". */
export function optionPriceLabel(option: SellingOption, stockUnit: string, groupSize: number | null): string {
  const shape = optionShape(stockUnit, option, groupSize);
  if (shape === 'group' || shape === 'dozen') return `Price for 1 ${unitLabel(option.unit)}`;
  const quantity = Number(option.quantity);
  return quantity > 0 ? `Price for ${formatQuantity(quantity, option.unit)}` : 'Price';
}

/** The line under an option: "1 pack = 10 pieces for ₹1,700.00 · ₹170.00 per piece"; null until it is complete. */
export function optionSummary(option: SellingOption, stockUnit: string, groupSize: number | null): string | null {
  const price = Number(option.sellingPrice);
  const quantity = Number(option.quantity);
  if (!(price > 0) || !(quantity > 0)) return null;
  const shape = optionShape(stockUnit, option, groupSize);
  if (shape === 'group' || shape === 'dozen') {
    const pieces = optionPieces(option, stockUnit, groupSize);
    if (!pieces) return null;
    return `1 ${unitLabel(option.unit)} = ${formatQuantity(pieces, 'PIECE')} for ${formatMoney(price)} · ${formatMoney(price / pieces)} per piece`;
  }
  const text = `${formatQuantity(quantity, option.unit)} for ${formatMoney(price)}`;
  return quantity === 1 ? text : `${text} · ${formatMoney(price / quantity)} per ${unitLabel(option.unit)}`;
}

/** Why an option cannot be saved, or '' when it can. */
export function sellingOptionError(option: SellingOption, stockUnit: string, groupSize: number | null): string {
  const shape = optionShape(stockUnit, option, groupSize);
  if (shape === 'group' && !optionPieces(option, stockUnit, groupSize)) return `enter how many pieces are in one ${unitLabel(option.unit)}.`;
  if (option.piecesPerUnit != null && (!Number.isInteger(option.piecesPerUnit) || option.piecesPerUnit < 1 || option.piecesPerUnit > 100000)) return 'pieces must be a whole number from 1 to 100000.';
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(option.quantity) || Number(option.quantity) <= 0) return 'enter a quantity greater than zero.';
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(option.sellingPrice) || Number(option.sellingPrice) <= 0) return 'enter a price greater than zero.';
  const conversion = sellingUnitConversion(stockUnit, groupSize, option.unit, option.piecesPerUnit);
  if (!conversion) return stockUnit === 'BOX' || stockUnit === 'PACK' ? `enter pieces per ${unitLabel(stockUnit)} above to sell this product by the piece.` : 'choose a unit that fits how this product is stocked.';
  const movement = (conversion.perOption ? 1 : Number(option.quantity)) * conversion.numerator / conversion.denominator;
  const pieces = movement * (conversion.unit === 'PIECE' ? 1 : groupSize || 1);
  if ((groupSize || stockUnit === 'PIECE') && Math.abs(pieces - Math.round(pieces)) > 1e-8) return 'the quantity must contain whole pieces.';
  if (Math.abs(movement * 1000 - Math.round(movement * 1000)) > 1e-7) return 'use a quantity that fits the stock unit’s three-decimal precision.';
  return '';
}

/** Options as saved: a blank name becomes the default one. */
export function sellingOptionsForSave(options: SellingOption[], stockUnit: string, groupSize: number | null): SellingOption[] {
  return options.map((option) => ({ ...option, name: option.name.trim() || defaultOptionName(option, stockUnit, groupSize) }));
}
