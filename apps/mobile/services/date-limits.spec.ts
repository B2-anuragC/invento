import { describe, expect, it } from 'vitest';

import { canShowPreviousMonth, dateKey, isSelectableDay } from './date-limits';

describe('dateKey', () => {
  it('uses the local calendar day', () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dateKey(new Date(2026, 10, 15, 0, 0))).toBe('2026-11-15');
  });
});

describe('isSelectableDay', () => {
  it('allows every day without a minimum', () => {
    expect(isSelectableDay('2020-01-01')).toBe(true);
  });

  it('allows the minimum day and later, not earlier', () => {
    expect(isSelectableDay('2026-10-31', '2026-10-31')).toBe(true);
    expect(isSelectableDay('2026-11-01', '2026-10-31')).toBe(true);
    expect(isSelectableDay('2026-10-30', '2026-10-31')).toBe(false);
    expect(isSelectableDay('2025-12-31', '2026-01-01')).toBe(false);
  });
});

describe('canShowPreviousMonth', () => {
  it('stops at the month that contains the minimum day', () => {
    expect(canShowPreviousMonth(new Date(2026, 9, 1), '2026-10-31')).toBe(false);
    expect(canShowPreviousMonth(new Date(2026, 10, 1), '2026-10-31')).toBe(true);
    expect(canShowPreviousMonth(new Date(2027, 0, 1), '2026-12-31')).toBe(true);
    expect(canShowPreviousMonth(new Date(2027, 0, 1), '2027-01-01')).toBe(false);
  });

  it('is always allowed without a minimum', () => {
    expect(canShowPreviousMonth(new Date(2026, 9, 1))).toBe(true);
  });
});
