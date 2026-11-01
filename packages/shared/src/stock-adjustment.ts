// Stock adjustments: one plan for phones and admin, so both send the same
// movement to POST /inventory/adjustments and refuse the same mistakes.

export const STOCK_ADJUSTMENT_MODES = ["count", "add", "remove"] as const;
export type StockAdjustmentMode = (typeof STOCK_ADJUSTMENT_MODES)[number];

export const STOCK_ADJUSTMENT_REASONS = ["COUNT_CORRECTION", "DAMAGE", "EXPIRED", "OTHER"] as const;
export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number];

export const stockAdjustmentModeLabels: Record<StockAdjustmentMode, string> = {
  count: "Set counted quantity",
  add: "Add stock",
  remove: "Remove stock",
};

export const stockAdjustmentReasonLabels: Record<StockAdjustmentReason, string> = {
  COUNT_CORRECTION: "Count correction",
  DAMAGE: "Damage",
  EXPIRED: "Expired",
  OTHER: "Other",
};

/** Damage and expiry only ever take stock out. */
export function reasonsForMode(mode: StockAdjustmentMode): StockAdjustmentReason[] {
  return mode === "add" ? ["COUNT_CORRECTION", "OTHER"] : [...STOCK_ADJUSTMENT_REASONS];
}

export type StockAdjustmentType = "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "DAMAGE" | "EXPIRED";

export type StockAdjustmentRequest = {
  productId: string;
  type: StockAdjustmentType;
  /** Unsigned amount in the product's stock unit. */
  quantity: string;
  note?: string;
  /** For a count: the stock the difference was worked out from. The server refuses the change if stock moved since. */
  expectedQuantity?: string;
};

export type StockAdjustmentInput = {
  productId: string;
  mode: StockAdjustmentMode;
  /** Counted quantity, or the amount to add or remove, as typed. */
  quantity: string;
  reason: StockAdjustmentReason;
  note?: string;
  /** Current stock in the product's stock unit. */
  currentStock: string | number;
  unit: string;
  piecesPerUnit?: number | null;
};

export type StockAdjustmentPlan =
  | { ok: true; request: StockAdjustmentRequest; before: number; after: number; change: number }
  | { ok: false; error: string };

export const STOCK_ADJUSTMENT_NOTE_MAX = 400;

// Quantities have at most three decimals, so whole thousandths keep the sums exact.
const thousandths = (value: string | number) => Math.round(Number(value) * 1000);
const fromThousandths = (value: number) => {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 1000);
  const fraction = String(absolute % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
};

/**
 * Works out the movement for an adjustment, or why it cannot be saved.
 * A count records the difference from the current stock; stock never goes below zero.
 */
export function planStockAdjustment(input: StockAdjustmentInput): StockAdjustmentPlan {
  const typed = input.quantity.trim();
  const counting = input.mode === "count";
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(typed)) {
    return { ok: false, error: counting ? "Enter the counted quantity, with up to three decimal places." : "Enter a quantity, with up to three decimal places." };
  }
  const amount = thousandths(typed);
  if (!counting && amount === 0) return { ok: false, error: "Enter a quantity greater than zero." };
  if (input.unit === "PIECE" && amount % 1000 !== 0) return { ok: false, error: "Enter a whole number of pieces." };
  const groupSize = input.unit === "DOZEN" ? 12 : input.piecesPerUnit;
  if (groupSize && (amount * groupSize) % 1000 !== 0) return { ok: false, error: "The quantity must be a whole number of pieces." };
  if (input.mode === "add" && (input.reason === "DAMAGE" || input.reason === "EXPIRED")) {
    return { ok: false, error: "Damage and expiry can only remove stock." };
  }
  const note = (input.note ?? "").trim();
  if (input.reason === "OTHER" && !note) return { ok: false, error: "Add a note saying why the stock changed." };
  if (note.length > STOCK_ADJUSTMENT_NOTE_MAX) return { ok: false, error: `Keep the note under ${STOCK_ADJUSTMENT_NOTE_MAX} characters.` };

  const before = thousandths(input.currentStock);
  const change = counting ? amount - before : input.mode === "add" ? amount : -amount;
  if (change === 0) return { ok: false, error: "The count matches the current stock, so there is nothing to change." };
  if (before + change < 0) return { ok: false, error: `Only ${fromThousandths(before)} in stock, so you cannot remove ${fromThousandths(-change)}.` };
  if (change > 0 && (input.reason === "DAMAGE" || input.reason === "EXPIRED")) {
    return { ok: false, error: "The count is higher than the stock. Damage and expiry can only remove stock; choose Count correction or Other." };
  }

  const type: StockAdjustmentType = change > 0 ? "ADJUSTMENT_IN" : input.reason === "DAMAGE" ? "DAMAGE" : input.reason === "EXPIRED" ? "EXPIRED" : "ADJUSTMENT_OUT";
  // Damage and expiry are named by the movement type; the note keeps the rest of the story.
  const prefix = counting ? `Counted ${typed.replace(/^0+(?=\d)/, "")}` : input.reason === "COUNT_CORRECTION" ? "Count correction" : "";
  const fullNote = [prefix, note].filter(Boolean).join(" · ");
  return {
    ok: true,
    before: before / 1000,
    after: (before + change) / 1000,
    change: change / 1000,
    request: {
      productId: input.productId,
      type,
      quantity: fromThousandths(Math.abs(change)),
      ...(fullNote ? { note: fullNote } : {}),
      ...(counting ? { expectedQuantity: fromThousandths(before) } : {}),
    },
  };
}

const movementLabels: Record<string, string> = {
  OPENING_STOCK: "Opening stock",
  PURCHASE: "Purchase",
  SALE: "Sale",
  RETURN_IN: "Returned to stock",
  RETURN_OUT: "Returned to supplier",
  ADJUSTMENT_IN: "Stock added",
  ADJUSTMENT_OUT: "Stock removed",
  DAMAGE: "Damaged",
  EXPIRED: "Expired",
};

/** Readable name for a stock movement type in stock history. */
export function inventoryMovementLabel(type: string): string {
  return movementLabels[type] ?? type.replaceAll("_", " ").toLowerCase().replace(/^./, (first) => first.toUpperCase());
}
