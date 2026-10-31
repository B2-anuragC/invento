export type SessionHolder<T> = { current: T | null };

/** Whether a route can only be shown to a signed-in user. The entry screen and auth screens are public. */
export function requiresSignIn(path: string): boolean {
  return path !== '/' && path !== '/index' && !path.startsWith('/auth/');
}

/**
 * Restores the persisted session at most once per app load, so every route —
 * including deep links that bypass the entry screen — starts with it in place.
 */
export function createSessionLoader<T>(restore: () => Promise<T | null>, holder: SessionHolder<T>): () => Promise<T | null> {
  let pending: Promise<T | null> | null = null;
  return () => {
    if (holder.current) return Promise.resolve(holder.current);
    pending ??= restore()
      .catch(() => null)
      .then((session) => {
        // A sign-in that finished while restoring wins over the stored session.
        if (!holder.current) holder.current = session;
        return holder.current;
      });
    // Read the holder after restoring, so a later sign-out is respected.
    return pending.then(() => holder.current);
  };
}
