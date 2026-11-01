import { indiaDate } from './dashboard-summary';
import { formatDate } from './format';

// Activity's date ranges. Days start and end at midnight in India (Asia/Kolkata),
// whatever time zone the device is set to, like the dashboard and invoice numbers.

export type ActivityRangeKind = 'all' | 'today' | 'week' | 'month' | 'custom';
/** `from` and `to` (inclusive YYYY-MM-DD India dates) are only used by a custom range; either may be empty. */
export type ActivityRange = { kind: ActivityRangeKind; from?: string; to?: string };
export type ActivityRangeBounds = { from: string | null; to: string | null };

export const activityRangeOptions: { kind: ActivityRangeKind; label: string }[] = [
  { kind: 'all', label: 'All dates' },
  { kind: 'today', label: 'Today' },
  { kind: 'week', label: 'This week' },
  { kind: 'month', label: 'This month' },
  { kind: 'custom', label: 'Custom' },
];

const shiftDays = (day: string, days: number) => new Date(new Date(`${day}T00:00:00.000Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

/**
 * The first and last India day a range covers, or null when it covers every date.
 * A week runs Monday to Sunday and a month from its 1st to its last day, both
 * including days still to come (a bill may be dated tomorrow). A custom range
 * picked back to front is read the right way round.
 */
export function activityRangeBounds(range: ActivityRange, now: Date = new Date()): ActivityRangeBounds | null {
  const today = indiaDate(now);
  switch (range.kind) {
    case 'today': return { from: today, to: today };
    case 'week': {
      const monday = shiftDays(today, -((new Date(`${today}T00:00:00.000Z`).getUTCDay() + 6) % 7));
      return { from: monday, to: shiftDays(monday, 6) };
    }
    case 'month': {
      const [year, month] = today.split('-').map(Number);
      return { from: `${today.slice(0, 7)}-01`, to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
    }
    case 'custom': {
      const from = range.from || null;
      const to = range.to || null;
      if (!from && !to) return null;
      return from && to && from > to ? { from: to, to: from } : { from, to };
    }
    default: return null;
  }
}

/** Whether a moment (ISO timestamp) falls on a day inside the bounds, by its India date. */
export function inActivityRange(value: string, bounds: ActivityRangeBounds | null): boolean {
  if (!bounds) return true;
  const day = indiaDate(value);
  return (!bounds.from || day >= bounds.from) && (!bounds.to || day <= bounds.to);
}

const shortDate = (day: string) => formatDate(day).replace(/ \d{4}$/, '');

/** "1 Nov 2026", "26 Oct – 1 Nov 2026", "From 3 Oct 2026", "Up to 15 Oct 2026"; empty for every date. */
export function activityRangeLabel(bounds: ActivityRangeBounds | null): string {
  if (!bounds || (!bounds.from && !bounds.to)) return '';
  if (!bounds.to) return `From ${formatDate(bounds.from!)}`;
  if (!bounds.from) return `Up to ${formatDate(bounds.to)}`;
  if (bounds.from === bounds.to) return formatDate(bounds.from);
  return `${bounds.from.slice(0, 4) === bounds.to.slice(0, 4) ? shortDate(bounds.from) : formatDate(bounds.from)} – ${formatDate(bounds.to)}`;
}
