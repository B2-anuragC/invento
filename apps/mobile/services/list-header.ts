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
