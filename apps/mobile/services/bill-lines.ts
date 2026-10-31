// A bill line is identified by its product and selling option, so a product can
// be on the bill twice when sold differently: one "Pack of 10" plus loose pieces.

export type BillLine = { productId: string; optionId?: string; quantity: string; price: string };

const separator = '::';

export function lineKey(line: { productId: string; optionId?: string }): string {
  return line.optionId ? `${line.productId}${separator}${line.optionId}` : line.productId;
}

export function sameLine(a: { productId: string; optionId?: string }, b: { productId: string; optionId?: string }): boolean {
  return lineKey(a) === lineKey(b);
}

type DraftLines = { quantities: Record<string, string>; prices: Record<string, string>; selectedOptions?: Record<string, string> };

/** Draft maps keyed by line. Plain lines keep the bare product id, as older drafts did. */
export function encodeDraftLines(lines: BillLine[]): Required<DraftLines> {
  return {
    quantities: Object.fromEntries(lines.map((line) => [lineKey(line), line.quantity])),
    prices: Object.fromEntries(lines.map((line) => [lineKey(line), line.price])),
    selectedOptions: Object.fromEntries(lines.filter((line) => line.optionId).map((line) => [lineKey(line), line.optionId!])),
  };
}

/**
 * Restores lines for products that still exist. Reads both line-keyed drafts and
 * older drafts, where a bare product id carried its option in selectedOptions.
 */
export function decodeDraftLines(draft: DraftLines, priceFor: (productId: string) => string | undefined): BillLine[] {
  return Object.entries(draft.quantities).flatMap(([key, quantity]) => {
    const [productId, keyedOption] = key.split(separator);
    const fallbackPrice = priceFor(productId);
    if (fallbackPrice === undefined) return [];
    const optionId = keyedOption ?? draft.selectedOptions?.[key];
    return [{ productId, optionId, quantity, price: draft.prices[key] ?? fallbackPrice }];
  });
}
