import { describe, expect, it } from 'vitest';

import { activityRangeBounds, activityRangeLabel, inActivityRange } from './activity-range';

// 1 Nov 2026 is a Sunday. 19:00 UTC on 31 Oct is already 00:30 on 1 Nov in India.
const sundayNightUtc = new Date('2026-10-31T19:00:00.000Z');

describe('activityRangeBounds', () => {
  it('covers every date for all dates and an empty custom range', () => {
    expect(activityRangeBounds({ kind: 'all' })).toBeNull();
    expect(activityRangeBounds({ kind: 'custom', from: '', to: '' })).toBeNull();
  });

  it('takes today from the India clock, not UTC', () => {
    expect(activityRangeBounds({ kind: 'today' }, sundayNightUtc)).toEqual({ from: '2026-11-01', to: '2026-11-01' });
    expect(activityRangeBounds({ kind: 'today' }, new Date('2026-10-31T18:29:59.000Z'))).toEqual({ from: '2026-10-31', to: '2026-10-31' });
  });

  it('runs a week from Monday to Sunday', () => {
    expect(activityRangeBounds({ kind: 'week' }, sundayNightUtc)).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    // Monday 2 Nov starts the next week.
    expect(activityRangeBounds({ kind: 'week' }, new Date('2026-11-02T04:00:00.000Z'))).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    // A week across a year end.
    expect(activityRangeBounds({ kind: 'week' }, new Date('2027-01-01T06:00:00.000Z'))).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('runs a month from its 1st to its last day', () => {
    expect(activityRangeBounds({ kind: 'month' }, sundayNightUtc)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(activityRangeBounds({ kind: 'month' }, new Date('2028-02-10T06:00:00.000Z'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(activityRangeBounds({ kind: 'month' }, new Date('2026-12-31T20:00:00.000Z'))).toEqual({ from: '2027-01-01', to: '2027-01-31' });
  });

  it('keeps a custom range open at either end and puts a reversed one right', () => {
    expect(activityRangeBounds({ kind: 'custom', from: '2026-10-03' })).toEqual({ from: '2026-10-03', to: null });
    expect(activityRangeBounds({ kind: 'custom', to: '2026-10-15' })).toEqual({ from: null, to: '2026-10-15' });
    expect(activityRangeBounds({ kind: 'custom', from: '2026-10-15', to: '2026-10-03' })).toEqual({ from: '2026-10-03', to: '2026-10-15' });
  });
});

describe('inActivityRange', () => {
  const bounds = { from: '2026-10-26', to: '2026-11-01' };

  it('includes both end days in full, by India time', () => {
    expect(inActivityRange('2026-10-25T18:30:00.000Z', bounds)).toBe(true); // 00:00 on 26 Oct in India
    expect(inActivityRange('2026-10-25T18:29:59.999Z', bounds)).toBe(false); // 23:59 on 25 Oct in India
    expect(inActivityRange('2026-11-01T18:29:59.999Z', bounds)).toBe(true); // 23:59 on 1 Nov in India
    expect(inActivityRange('2026-11-01T18:30:00.000Z', bounds)).toBe(false); // 00:00 on 2 Nov in India
    expect(inActivityRange('2026-11-01T12:00:00+05:30', bounds)).toBe(true);
  });

  it('accepts everything without bounds and checks only the end that is set', () => {
    expect(inActivityRange('2020-01-01T00:00:00.000Z', null)).toBe(true);
    expect(inActivityRange('2026-12-31T06:00:00.000Z', { from: '2026-10-26', to: null })).toBe(true);
    expect(inActivityRange('2026-10-01T06:00:00.000Z', { from: '2026-10-26', to: null })).toBe(false);
    expect(inActivityRange('2026-10-01T06:00:00.000Z', { from: null, to: '2026-10-26' })).toBe(true);
  });
});

describe('activityRangeLabel', () => {
  it('names the days a range covers', () => {
    expect(activityRangeLabel(null)).toBe('');
    expect(activityRangeLabel({ from: '2026-11-01', to: '2026-11-01' })).toBe('1 Nov 2026');
    expect(activityRangeLabel({ from: '2026-10-26', to: '2026-11-01' })).toBe('26 Oct – 1 Nov 2026');
    expect(activityRangeLabel({ from: '2026-12-28', to: '2027-01-03' })).toBe('28 Dec 2026 – 3 Jan 2027');
    expect(activityRangeLabel({ from: '2026-10-03', to: null })).toBe('From 3 Oct 2026');
    expect(activityRangeLabel({ from: null, to: '2026-10-15' })).toBe('Up to 15 Oct 2026');
  });
});
