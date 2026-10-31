// Hands a glass-calculator result back to the sale or purchase that opened it.
// The calculator returns with router.back(), so the opener keeps its state and
// picks the result up when it regains focus.

export type MeasurementTarget = 'sale' | 'purchase';
export type Measurement = { target: MeasurementTarget; productId: string; quantity: string };

let pending: Measurement | null = null;

export function sendMeasurement(measurement: Measurement): void {
  pending = measurement;
}

/** Returns and clears a result meant for this screen; a result for the other kind of screen is left alone. */
export function receiveMeasurement(target: MeasurementTarget): Measurement | null {
  if (!pending || pending.target !== target) return null;
  const measurement = pending;
  pending = null;
  return measurement;
}

/** Square feet as a quantity input: at most three decimals, without trailing zeros. */
export function measurementQuantity(squareFeet: number): string {
  return Number(squareFeet.toFixed(3)).toString();
}

export function measurementTarget(value: string | string[] | undefined): MeasurementTarget {
  return value === 'purchase' ? 'purchase' : 'sale';
}
