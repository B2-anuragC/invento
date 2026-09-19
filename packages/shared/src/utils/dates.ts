import type { IsoDateString } from '../types/index.js';

export function toIsoDateString(value: Date | string | number): IsoDateString {
  return new Date(value).toISOString();
}
