import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('measurement hand-off', () => {
  let handoff: typeof import('./measurement-handoff');
  beforeEach(async () => {
    vi.resetModules();
    handoff = await import('./measurement-handoff');
  });

  it('delivers a result once, to the kind of screen that asked for it', () => {
    handoff.sendMeasurement({ target: 'purchase', productId: 'glass', quantity: '12' });
    expect(handoff.receiveMeasurement('sale')).toBeNull();
    expect(handoff.receiveMeasurement('purchase')).toEqual({ target: 'purchase', productId: 'glass', quantity: '12' });
    expect(handoff.receiveMeasurement('purchase')).toBeNull();
  });

  it('keeps only the latest result', () => {
    handoff.sendMeasurement({ target: 'sale', productId: 'a', quantity: '1' });
    handoff.sendMeasurement({ target: 'sale', productId: 'b', quantity: '2' });
    expect(handoff.receiveMeasurement('sale')).toMatchObject({ productId: 'b', quantity: '2' });
  });

  it('formats square feet as a quantity input', () => {
    expect(handoff.measurementQuantity(12)).toBe('12');
    expect(handoff.measurementQuantity(4.8611111)).toBe('4.861');
    expect(handoff.measurementQuantity(0.5)).toBe('0.5');
  });

  it('defaults to a sale when the opener is not named', () => {
    expect(handoff.measurementTarget('purchase')).toBe('purchase');
    expect(handoff.measurementTarget('sale')).toBe('sale');
    expect(handoff.measurementTarget(undefined)).toBe('sale');
    expect(handoff.measurementTarget(['purchase'])).toBe('sale');
  });
});
