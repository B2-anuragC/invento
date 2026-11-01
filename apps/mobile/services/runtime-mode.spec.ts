import { expect, it } from 'vitest';

import { isDeviceOnly } from './runtime-mode';

it('treats a guest session as device-only and an account session as server-backed', () => {
  expect(isDeviceOnly({ mode: 'guest' })).toBe(true);
  expect(isDeviceOnly({})).toBe(false);
  expect(isDeviceOnly(null)).toBe(false);
  expect(isDeviceOnly(undefined)).toBe(false);
});
