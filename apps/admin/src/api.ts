const base = import.meta.env.VITE_API_URL || "/api";
// Session credentials remain in memory. Reloading requires a fresh login.
let accessToken = "";
let refreshToken = "";
let refreshing: Promise<void> | undefined;
let onSessionExpired = () => {};
export function setSessionExpired(handler: () => void) {
  onSessionExpired = handler;
}
export function clearSession() {
  platformSession = false;
  accessToken = "";
  refreshToken = "";
}
let platformSession = false;
async function send(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const business = path.startsWith("/businesses/")
    ? decodeURIComponent(path.split("/")[2])
    : headers.get("X-Business-Id");
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (platformSession && business)
    headers.set("X-Platform-Access", "business-management");
  return fetch(`${base}${path}`, { ...init, headers });
}
async function parse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(
        body.error?.message ||
          body.message ||
          `Request failed (${response.status}).`,
      ),
      { status: response.status },
    );
  return body.data;
}
export type PanelAccess = {
  isPlatformAdmin: boolean;
  shops: { id: string; name: string; slug: string }[];
};
export async function login(
  email: string,
  password: string,
): Promise<PanelAccess> {
  const session = await parse<{ accessToken: string; refreshToken: string }>(
    await send("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  );
  accessToken = session.accessToken;
  refreshToken = session.refreshToken;
  try {
    const access = await api<PanelAccess>("/auth/panel-access");
    if (!access.isPlatformAdmin && !access.shops.length)
      throw new Error(
        "This panel requires an active business member or platform administrator account.",
      );
    platformSession = access.isPlatformAdmin;
    return access;
  } catch (error) {
    await logout();
    throw error;
  }
}
export async function logout() {
  const token = refreshToken;
  clearSession();
  if (token)
    await send("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => {});
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init);
  if (response.status === 401 && refreshToken) {
    refreshing ??= (async () => {
      const session = await parse<{
        accessToken: string;
        refreshToken: string;
      }>(
        await send("/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        }),
      );
      accessToken = session.accessToken;
      refreshToken = session.refreshToken;
    })().finally(() => {
      refreshing = undefined;
    });
    try {
      await refreshing;
      response = await send(path, init);
    } catch {
      clearSession();
      onSessionExpired();
      throw new Error("Session expired. Please sign in again.");
    }
  }
  if (response.status === 401) {
    clearSession();
    onSessionExpired();
  }
  return parse<T>(response);
}
