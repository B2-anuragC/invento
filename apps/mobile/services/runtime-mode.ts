// Expo replaces these public environment variables while bundling the app.
export const LOCAL_ONLY = process.env.EXPO_PUBLIC_LOCAL_ONLY === 'true';

/**
 * Whether this session's shop lives only on the device: always in the
 * local-only build, and for a guest who has not created an account yet.
 */
export function isDeviceOnly(session: { mode?: 'guest' } | null | undefined): boolean {
  return LOCAL_ONLY || session?.mode === 'guest';
}
