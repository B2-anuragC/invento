import { describe, expect, it, vi } from 'vitest';

import { createSessionLoader, requiresSignIn } from './session-loader';

type Session = { id: string };

describe('requiresSignIn', () => {
  it('allows the entry and auth screens without a session', () => {
    for (const path of ['/', '/index', '/auth/login', '/auth/register']) expect(requiresSignIn(path)).toBe(false);
  });

  it('protects every other screen, including deep links outside the tabs', () => {
    for (const path of ['/products', '/people', '/business/setup', '/sale/abc', '/product/new', '/settings/access', '/authority']) {
      expect(requiresSignIn(path)).toBe(true);
    }
  });
});

describe('createSessionLoader', () => {
  it('restores the stored session into the holder', async () => {
    const holder: { current: Session | null } = { current: null };
    const load = createSessionLoader(async () => ({ id: 'stored' }), holder);

    await expect(load()).resolves.toEqual({ id: 'stored' });
    expect(holder.current).toEqual({ id: 'stored' });
  });

  it('restores only once for concurrent and repeated calls', async () => {
    const restore = vi.fn(async () => ({ id: 'stored' }));
    const load = createSessionLoader(restore, { current: null });

    const [first, second] = await Promise.all([load(), load()]);
    await load();

    expect(first).toBe(second);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('returns an existing session without reading storage', async () => {
    const restore = vi.fn(async () => ({ id: 'stored' }));
    const holder = { current: { id: 'signed-in' } };

    await expect(createSessionLoader(restore, holder)()).resolves.toEqual({ id: 'signed-in' });
    expect(restore).not.toHaveBeenCalled();
  });

  it('keeps a sign-in that completes while storage is being read', async () => {
    const holder: { current: Session | null } = { current: null };
    let finish: (session: Session) => void = () => {};
    const load = createSessionLoader(() => new Promise<Session>((resolve) => { finish = resolve; }), holder);

    const result = load();
    holder.current = { id: 'signed-in' };
    finish({ id: 'stored' });

    await expect(result).resolves.toEqual({ id: 'signed-in' });
    expect(holder.current).toEqual({ id: 'signed-in' });
  });

  it('does not bring back a session after sign-out', async () => {
    const holder: { current: Session | null } = { current: null };
    const load = createSessionLoader(async () => ({ id: 'stored' }), holder);

    await load();
    holder.current = null;

    await expect(load()).resolves.toBeNull();
  });

  it('resolves to null when there is no stored session or storage fails', async () => {
    const empty = { current: null };
    await expect(createSessionLoader(async () => null, empty)()).resolves.toBeNull();
    expect(empty.current).toBeNull();

    const failing = { current: null };
    await expect(createSessionLoader(() => Promise.reject(new Error('storage unavailable')), failing)()).resolves.toBeNull();
    expect(failing.current).toBeNull();
  });
});
