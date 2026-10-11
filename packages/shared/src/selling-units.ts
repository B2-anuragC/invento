const groups = ['PIECE', 'DOZEN', 'BOX', 'PACK'];
const measures: Record<string, { family: string; scale: number }> = {
  KG: { family: 'weight', scale: 1000 }, GRAM: { family: 'weight', scale: 1 },
  LITRE: { family: 'volume', scale: 1000 }, MILLILITRE: { family: 'volume', scale: 1 },
  METRE: { family: 'length', scale: 1 }, FOOT: { family: 'length', scale: 0.3048 },
};
export function sellingUnitChoices(stockUnit: string, _piecesPerUnit?: number | null): string[] {
  const units = ['PIECE', 'KG', 'GRAM', 'LITRE', 'MILLILITRE', 'METRE', 'SQUARE_FOOT', 'FOOT', 'PACK', 'BOX', 'DOZEN', 'OTHER'];
  return [stockUnit, ...units.filter((unit) => unit !== stockUnit)];
}
/** Convert an option unit into a supported inventory movement, without rounding. */
export function sellingUnitConversion(stockUnit: string, stockSize: number | null | undefined, optionUnit: string, optionSize?: number | null) {
  if (optionSize != null && (!Number.isInteger(optionSize) || optionSize < 1 || optionSize > 100000)) return null;
  if (optionUnit === stockUnit && optionSize == null) return { unit: stockUnit, numerator: 1, denominator: 1 };
  if (groups.includes(stockUnit) && groups.includes(optionUnit)) {
    const size = stockUnit === 'PIECE' ? 1 : stockUnit === 'DOZEN' ? 12 : stockSize;
    const optionPieces = optionUnit === 'PIECE' ? 1 : optionUnit === 'DOZEN' ? 12 : optionSize ?? (optionUnit === stockUnit ? size : undefined);
    if (!size || !optionPieces || !Number.isInteger(optionPieces) || optionPieces < 1 || optionPieces > 100000) return null;
    return { unit: 'PIECE', numerator: optionPieces, denominator: 1 };
  }
  const stock = measures[stockUnit]; const option = measures[optionUnit];
  if (stock && option && stock.family === option.family) return { unit: stockUnit, numerator: option.scale, denominator: stock.scale };
  // A custom option describes one stock item; its quantity is a sales label, not a dimensional conversion.
  return { unit: stockUnit, numerator: 1, denominator: 1, perOption: true };
}
