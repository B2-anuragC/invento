// Search and pages for the shop's tables, which load whole lists from the API.
// Self-contained: the tests load this module on its own.

export const PAGE_SIZES = [25, 50, 100];
type Cells = Record<string, unknown>;

/** Lower case with single spaces, so "  INV/2026 " finds "inv/2026". */
const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Rows whose shown columns contain every word of the search, ignoring case.
 * Each column is matched as it reads in the table (`show`) and as stored, so
 * "1 nov", "₹1,180" and "1180" all find a bill.
 */
export function searchRows<T extends Cells>(rows: T[], keys: string[], query: string, show: (key: string, value: unknown) => string): T[] {
  const words = normalise(query).split(" ").filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((row) => {
    const text = normalise(
      keys
        .flatMap((key) => {
          const value = row[key];
          const raw = value == null || typeof value === "object" ? "" : String(value);
          return [show(key, value), raw];
        })
        .join(" "),
    );
    return words.every((word) => text.includes(word));
  });
}

/** One page of rows, with the page moved back inside the list when it shrank. */
export function pageOf<T>(rows: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const shown = rows.slice(start, start + size);
  return { rows: shown, page: current, pages, from: shown.length ? start + 1 : 0, to: start + shown.length, total: rows.length };
}

/** The footer line: "Showing 26–50 of 134", "1 record" or "No records". */
export function pageSummary(view: { from: number; to: number; total: number }, searched: boolean): string {
  const noun = searched ? "match" : "record";
  if (!view.total) return searched ? "No matches" : "No records";
  if (view.total <= view.to - view.from + 1) return `${view.total} ${noun}${view.total === 1 ? "" : searched ? "es" : "s"}`;
  return `Showing ${view.from}–${view.to} of ${view.total} ${noun}${searched ? "es" : "s"}`;
}
