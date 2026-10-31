import type { EffectiveAccess } from '@invento/shared';
import { describe, expect, it, vi } from 'vitest';

import { isServerUnreachable, liveOrCachedAccess, OFFLINE_WITHOUT_DOWNLOAD_MESSAGE, sameAccess } from './access-fallback';

const access = (role: string): EffectiveAccess => ({ userId: 'u', businessId: 'b', role, permissions: ['sales.create'], platformAccess: false });
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('isServerUnreachable', () => {
  it('treats network errors and server failures as unreachable', () => {
    expect(isServerUnreachable(new TypeError('Network request failed'))).toBe(true);
    expect(isServerUnreachable(new Error('fetch failed: java.net.ConnectException'))).toBe(true);
    expect(isServerUnreachable(httpError(502))).toBe(true);
    expect(isServerUnreachable(httpError(500))).toBe(true);
    expect(isServerUnreachable(null)).toBe(true);
  });

  it('treats answers from the server as reachable', () => {
    for (const status of [400, 401, 403, 404, 422]) expect(isServerUnreachable(httpError(status))).toBe(false);
  });
});

describe('liveOrCachedAccess', () => {
  it('prefers live permissions and does not read the cache', async () => {
    const cached = vi.fn(async () => access('CACHED'));
    await expect(liveOrCachedAccess(async () => access('LIVE'), cached)).resolves.toMatchObject({ role: 'LIVE' });
    expect(cached).not.toHaveBeenCalled();
  });

  it('uses downloaded permissions when the server cannot be reached', async () => {
    const offline = () => Promise.reject(new TypeError('Network request failed'));
    await expect(liveOrCachedAccess(offline, async () => access('CACHED'))).resolves.toMatchObject({ role: 'CACHED' });
    await expect(liveOrCachedAccess(() => Promise.reject(httpError(503)), async () => access('CACHED'))).resolves.toMatchObject({ role: 'CACHED' });
  });

  it('never overrides a refusal from the server with the cache', async () => {
    for (const status of [401, 403]) {
      const cached = vi.fn(async () => access('CACHED'));
      await expect(liveOrCachedAccess(() => Promise.reject(httpError(status)), cached)).rejects.toMatchObject({ status });
      expect(cached).not.toHaveBeenCalled();
    }
  });

  it('explains what to do when offline without a downloaded business', async () => {
    const offline = () => Promise.reject(new TypeError('fetch failed: java.net.ConnectException'));
    await expect(liveOrCachedAccess(offline, async () => null)).rejects.toThrow(OFFLINE_WITHOUT_DOWNLOAD_MESSAGE);
    await expect(liveOrCachedAccess(offline, () => Promise.reject(new Error('storage unavailable')))).rejects.toThrow(OFFLINE_WITHOUT_DOWNLOAD_MESSAGE);
  });
});

describe('sameAccess', () => {
  const base: EffectiveAccess = { userId: 'u', businessId: 'b', role: 'OWNER', permissions: ['sales.view', 'sales.create'], platformAccess: false };

  it('treats the same grants in any order as unchanged', () => {
    expect(sameAccess(base, { ...base, permissions: ['sales.create', 'sales.view'] })).toBe(true);
  });

  it('detects any change in what is granted or to whom', () => {
    expect(sameAccess(undefined, base)).toBe(false);
    expect(sameAccess(base, { ...base, permissions: ['sales.view'] })).toBe(false);
    expect(sameAccess(base, { ...base, permissions: ['sales.view', 'purchases.view'] })).toBe(false);
    expect(sameAccess(base, { ...base, role: 'ADMIN' })).toBe(false);
    expect(sameAccess(base, { ...base, businessId: 'other' })).toBe(false);
    expect(sameAccess(base, { ...base, userId: 'other' })).toBe(false);
    expect(sameAccess(base, { ...base, platformAccess: true })).toBe(false);
  });
});
