/** Local calendar day as YYYY-MM-DD, the format date fields store. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Whether a day can be picked; YYYY-MM-DD strings compare correctly as text. */
export function isSelectableDay(day: string, minimum?: string, maximum?: string): boolean {
  return (!minimum || day >= minimum) && (!maximum || day <= maximum);
}

/** The moment sent for a chosen day: now for today, otherwise noon in India on that day. */
export function dayToTimestamp(day: string, now = new Date()): string {
  return day === dateKey(now) ? now.toISOString() : `${day}T12:00:00+05:30`;
}

/** Whether the month before `month` still contains a selectable day. */
export function canShowPreviousMonth(month: Date, minimum?: string): boolean {
  if (!minimum) return true;
  const lastDayOfPrevious = new Date(month.getFullYear(), month.getMonth(), 0);
  return dateKey(lastDayOfPrevious) >= minimum;
}
