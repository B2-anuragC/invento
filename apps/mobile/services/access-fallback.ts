import type { EffectiveAccess } from '@invento/shared';

export const OFFLINE_WITHOUT_DOWNLOAD_MESSAGE =
  'You are offline. Connect once to download this business to your device, then it will keep working without a connection.';

/**
 * Whether a failed request means the server could not be reached, as opposed to
 * the server answering. A network error carries no HTTP status; 5xx means the
 * server or a proxy in front of it is down. A 401/403 is a real refusal.
 */
export function isServerUnreachable(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status !== 'number' || status >= 500;
}

/**
 * Uses live permissions when the server answers. When it cannot be reached, falls
 * back to the permissions downloaded with the business, so the app keeps working
 * offline. A server refusal is never overridden by the cached copy.
 */
export async function liveOrCachedAccess(
  live: () => Promise<EffectiveAccess>,
  cached: () => Promise<EffectiveAccess | null>,
): Promise<EffectiveAccess> {
  try {
    return await live();
  } catch (error) {
    if (!isServerUnreachable(error)) throw error;
    const access = await cached().catch(() => null);
    if (access) return access;
    throw Object.assign(new Error(OFFLINE_WITHOUT_DOWNLOAD_MESSAGE), { cause: error });
  }
}

/**
 * Whether a refreshed access record grants exactly what the current one does.
 * The provider keeps the existing object in that case, so the periodic refresh
 * does not re-render or reload every screen that depends on permissions.
 */
export function sameAccess(current: EffectiveAccess | undefined, next: EffectiveAccess): boolean {
  if (!current) return false;
  if (current.userId !== next.userId || current.businessId !== next.businessId || current.role !== next.role || current.platformAccess !== next.platformAccess) return false;
  if (current.permissions.length !== next.permissions.length) return false;
  const granted = new Set(current.permissions);
  return next.permissions.every((permission) => granted.has(permission));
}
