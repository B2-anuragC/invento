import { describe, expect, it } from 'vitest';
import { activeFilterChips, activeFilterCount, clearChipLabel, filterButtonLabels, statStripLabel } from './list-header';

describe('compact list headers', () => {
  it('counts only the filters that differ from their defaults', () => {
    expect(activeFilterCount({ status: 'All statuses', range: 'all' }, { status: 'All statuses', range: 'all' })).toBe(0);
    expect(activeFilterCount({ status: 'Unpaid', range: 'week', search: 'x' }, { status: 'All statuses', range: 'all' })).toBe(2);
  });
  it('shows the count on the Filters button and names it for screen readers', () => {
    expect(filterButtonLabels(0)).toEqual({ text: 'Filters', accessibilityLabel: 'Filters' });
    expect(filterButtonLabels(2)).toEqual({ text: 'Filters · 2', accessibilityLabel: 'Filters, 2 on' });
  });
  it('turns the filters that are on into clearable chips, in order', () => {
    const chips = activeFilterChips([
      { key: 'status', value: 'Unpaid', defaultValue: 'All statuses' },
      { key: 'range', value: 'all', defaultValue: 'all', label: 'All dates' },
      { key: 'range2', value: 'week', defaultValue: 'all', label: 'This week' },
    ]);
    expect(chips).toEqual([{ key: 'status', label: 'Unpaid' }, { key: 'range2', label: 'This week' }]);
    expect(clearChipLabel(chips[1])).toBe('Clear filter: This week');
  });
  it('reads the summary strip as one sentence and skips empty figures', () => {
    expect(statStripLabel([{ label: 'Total value', value: '₹1,180.00' }, { label: 'Sales', value: '40' }, { label: 'Note', value: '' }])).toBe('Total value ₹1,180.00, Sales 40');
  });
});
