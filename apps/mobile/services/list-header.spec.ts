import { describe, expect, it } from 'vitest';
import { activeFilterChips, activeFilterCount, catalogFilterChips, clearChipLabel, figureWidthEm, filterButtonLabels, statStripFigures, statStripLabel, statStripRows } from './list-header';

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
  it('puts four or more figures two to a row', () => {
    expect(statStripRows(['a', 'b'])).toEqual([['a', 'b']]);
    expect(statStripRows(['a', 'b', 'c'])).toEqual([['a', 'b', 'c']]);
    expect(statStripRows(['Products', 'Reorder', 'Value at cost', 'At selling price'])).toEqual([['Products', 'Reorder'], ['Value at cost', 'At selling price']]);
    expect(statStripRows(['a', 'b', 'c', 'd', 'e'])).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });
  // A 360 dp phone: 328 dp inside the 16 dp gutters.
  const fits = (rows: string[][], width = 328) => {
    const { flex, fontSize } = statStripFigures(rows, width);
    return rows.every((row, rowIndex) => {
      const total = flex[rowIndex].reduce((sum, weight) => sum + weight, 0);
      const textWidth = width - 2 - row.length * 20 - (row.length - 1);
      return row.every((value, index) => figureWidthEm(value) * fontSize <= (textWidth * flex[rowIndex][index]) / total);
    });
  };
  it('sizes money figures so every one shows in full, also on web', () => {
    const lakhs = '₹12,34,567.50';
    const crore = '₹1,23,45,678.00';
    // Inventory with four figures, two to a row: full 16 dp size even for crores.
    expect(statStripFigures(statStripRows(['12', '3', lakhs, crore]), 328).fontSize).toBe(16);
    // Sales: an amount in lakhs gets most of the row, and a count needs little.
    const sales = statStripFigures([[lakhs, '40', '₹228.20']], 328);
    expect(sales.flex[0][0]).toBeGreaterThan(sales.flex[0][1]);
    expect(sales.fontSize).toBe(16);
    // Three large amounts in one row get smaller, but each one still fits.
    for (const rows of [[[crore, '40', lakhs]], [[lakhs, '1,234', '₹10,00,000.00']], [['Hidden', '12', '3']]]) expect(fits(rows)).toBe(true);
    expect(statStripFigures([[crore, '40', lakhs]], 328).fontSize).toBeLessThan(16);
    // Small amounts keep the full size, and the floor holds for absurd values.
    expect(statStripFigures([['₹1,180.00', '40', '₹0.00']], 328).fontSize).toBe(16);
    expect(statStripFigures([['₹1,23,45,67,89,012.00', '₹1,23,45,67,89,012.00', '₹1,23,45,67,89,012.00']], 328).fontSize).toBe(11);
  });
  it('shows the Catalog sheet filters that are on as clearable chips', () => {
    expect(catalogFilterChips({ stock: 'all', unit: 'All', unitLabel: 'All', status: 'ACTIVE' })).toEqual([]);
    expect(catalogFilterChips({ stock: 'out', unit: 'SQ_FT', unitLabel: 'sq ft', status: 'INACTIVE' })).toEqual([
      { key: 'stock', label: 'Out of stock' },
      { key: 'unit', label: 'Unit: sq ft' },
      { key: 'status', label: 'Inactive products' },
    ]);
    expect(catalogFilterChips({ stock: 'low', unit: 'All', unitLabel: 'All', status: 'ACTIVE' })).toEqual([{ key: 'stock', label: 'Low stock' }]);
  });
});
