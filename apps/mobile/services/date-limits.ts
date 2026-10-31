/** Local calendar day as YYYY-MM-DD, the format date fields store. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Whether a day can be picked; YYYY-MM-DD strings compare correctly as text. */
export function isSelectableDay(day: string, minimum?: string): boolean {
  return !minimum || day >= minimum;
}

/** Whether the month before `month` still contains a selectable day. */
export function canShowPreviousMonth(month: Date, minimum?: string): boolean {
  if (!minimum) return true;
  const lastDayOfPrevious = new Date(month.getFullYear(), month.getMonth(), 0);
  return dateKey(lastDayOfPrevious) >= minimum;
}
