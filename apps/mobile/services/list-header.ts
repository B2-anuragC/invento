// Labels for the compact headers on phone list screens (F8): the Filters button,
// the chips that show which sheet filters are on, and the slim summary strip.

export type FilterChip = { key: string; label: string };
export type StatItem = { label: string; value: string };

/** How many filters differ from their defaults. Keys missing from `defaults` are ignored. */
export function activeFilterCount(current: Record<string, unknown>, defaults: Record<string, unknown>): number {
  return Object.keys(defaults).filter((key) => current[key] !== defaults[key]).length;
}

/** The Filters button: the visible text carries the count, and the screen-reader name says what it opens. */
export function filterButtonLabels(count: number, what = 'Filters') {
  return {
    text: count ? `${what} · ${count}` : what,
    accessibilityLabel: count ? `${what}, ${count} on` : what,
  };
}

/**
 * Chips for the sheet filters that are on, so they stay visible (and can be
 * cleared with one tap) while the sheet is closed. `options` is in display
 * order; a value equal to its default gives no chip.
 */
export function activeFilterChips(options: { key: string; value: string; defaultValue: string; label?: string }[]): FilterChip[] {
  return options.filter((option) => option.value !== option.defaultValue).map((option) => ({ key: option.key, label: option.label ?? option.value }));
}

/** The name a screen reader hears for a clearable filter chip. */
export function clearChipLabel(chip: FilterChip) {
  return `Clear filter: ${chip.label}`;
}

/** One sentence for the whole summary strip, read as one item: "Total value ₹1,180.00, Sales 40". */
export function statStripLabel(items: StatItem[]): string {
  return items.filter((item) => item.value).map((item) => `${item.label} ${item.value}`).join(', ');
}

/** Up to three summary figures share one row; four or more go two to a row so money amounts keep room to show in full. */
export function statStripRows<T>(items: T[]): T[][] {
  const perRow = items.length > 3 ? 2 : Math.max(items.length, 1);
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += perRow) rows.push(items.slice(index, index + perRow));
  return rows;
}

/** Rough width of a bold figure in ems: digits, letters and ₹ about 0.68, separators and spaces about 0.34. Errs wide (measured on web at weight 800). */
export function figureWidthEm(value: string): number {
  return [...value].reduce((sum, char) => sum + (/[\s,.:·'-]/.test(char) ? 0.34 : 0.68), 0);
}

/**
 * How the summary strip shares its width: in a single row each cell grows with
 * its figure (a count needs less room than an amount in lakhs), and one font size for
 * all figures, the largest (up to `max`) at which every one fits. react-native-web
 * cannot shrink text to fit, so this is worked out up front for every platform.
 * `stripWidth` is the strip's outer width; `cellPadding` the padding on each side of a cell.
 */
export function statStripFigures(rows: string[][], stripWidth: number, cellPadding = 10, max = 16, min = 11): { flex: number[][]; fontSize: number } {
  let fontSize = max;
  const flex = rows.map((row) => {
    const widths = row.map(figureWidthEm);
    // Rows of a grid keep equal columns so the dividers line up.
    const weights = widths.map((width) => (rows.length > 1 ? 1 : Math.max(3, width)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    // Two border pixels, the padding of every cell and a one-pixel divider between cells.
    const textWidth = stripWidth - 2 - row.length * cellPadding * 2 - (row.length - 1);
    widths.forEach((width, index) => {
      if (width) fontSize = Math.min(fontSize, Math.floor((textWidth * weights[index]) / total / width));
    });
    return weights;
  });
  return { flex, fontSize: Math.max(min, fontSize) };
}

/** Chips for the Catalog sheet filters that are on (stock status, unit, inactive products). Sort and grouping show on their own button. */
export function catalogFilterChips(filters: { stock: 'all' | 'low' | 'out'; unit: string; unitLabel: string; status: 'ACTIVE' | 'INACTIVE' }): FilterChip[] {
  return activeFilterChips([
    { key: 'stock', value: filters.stock, defaultValue: 'all', label: filters.stock === 'low' ? 'Low stock' : 'Out of stock' },
    { key: 'unit', value: filters.unit, defaultValue: 'All', label: `Unit: ${filters.unitLabel}` },
    { key: 'status', value: filters.status, defaultValue: 'ACTIVE', label: 'Inactive products' },
  ]);
}
