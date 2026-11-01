import { type StockAdjustmentPlan } from '@invento/shared';

import { formatQuantity } from './format';

// The adjust stock screen goes back to where it was opened from (Inventory or
// the product page). It hands over what changed here, and that screen picks it
// up when it regains focus, reloads stock and history, and says so.

export type StockNotice = { productId: string; text: string };

let pending: StockNotice | null = null;

export function sendStockNotice(notice: StockNotice): void {
  pending = notice;
}

/** Returns and clears the notice. With a product id, only a notice for that product is taken. */
export function receiveStockNotice(productId?: string): StockNotice | null {
  if (!pending || (productId && pending.productId !== productId)) return null;
  const notice = pending;
  pending = null;
  return notice;
}

type Saved = Extract<StockAdjustmentPlan, { ok: true }>;

/** "8 kg → 6 kg (2 kg removed)": shown before saving. */
export function stockChangePreview(plan: Saved, unit: string): string {
  const change = formatQuantity(Math.abs(plan.change), unit);
  return `${formatQuantity(plan.before, unit)} → ${formatQuantity(plan.after, unit)} (${change} ${plan.change > 0 ? 'added' : 'removed'})`;
}

/** What the screen says after saving. */
export function stockSavedNotice(name: string, plan: Saved, unit: string): string {
  return `Stock updated: ${name} is now ${formatQuantity(plan.after, unit)} (${formatQuantity(Math.abs(plan.change), unit)} ${plan.change > 0 ? 'added' : 'removed'}).`;
}

export const ADJUST_OFFLINE_MESSAGE = 'You are offline. Adjusting stock needs a connection, so it can be checked against the latest stock.';
export const ADJUST_PENDING_MESSAGE = 'Some changes on this phone have not synced yet. Sync them first (View sync), then adjust stock.';
