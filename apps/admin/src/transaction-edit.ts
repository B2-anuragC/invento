// Editing a saved sale or purchase from the admin tables.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * The bill's calendar date in India, for a date input. Slicing the stored UTC
 * timestamp would show the previous day for bills saved before 05:30 IST.
 */
export function istDateInput(value: unknown): string {
  const time = new Date(String(value)).getTime();
  if (Number.isNaN(time)) return "";
  return new Date(time + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Only the fields the user changed. Resending an unchanged date would move the
 * bill to midnight and could cross a financial-year boundary.
 */
export function changedFields(
  data: Record<string, unknown>,
  initial: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([key, value]) => value !== (initial[key] ?? "")),
  );
}
