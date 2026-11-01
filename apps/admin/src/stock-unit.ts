// How a stock unit reads after a quantity in the admin stock forms.

const plurals: Record<string, string> = {
  PIECE: "pieces",
  KG: "kg",
  GRAM: "g",
  LITRE: "litres",
  MILLILITRE: "ml",
  METRE: "metres",
  SQUARE_FOOT: "sq ft",
  FOOT: "ft",
  PACK: "packs",
  BOX: "boxes",
  DOZEN: "dozen",
  OTHER: "units",
};

/** "150 pieces", "2.25 dozen", "1 piece". Grouped stock such as 23 pieces reads "1.917 dozen". */
export function stockAmount(quantity: number | string, unit: unknown): string {
  const value = Math.round(Number(quantity) * 1000) / 1000;
  const name = plurals[String(unit)] ?? String(unit ?? "").replaceAll("_", " ").toLowerCase();
  const singular = value === 1 ? { pieces: "piece", litres: "litre", metres: "metre", packs: "pack", boxes: "box", units: "unit" }[name] : undefined;
  return `${value} ${singular ?? name}`;
}
