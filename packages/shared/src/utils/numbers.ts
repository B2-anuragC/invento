export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError('The minimum value must not be greater than the maximum value.');
  }

  return Math.min(Math.max(value, min), max);
}
