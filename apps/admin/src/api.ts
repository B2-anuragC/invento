import { shopIdFrom } from "@invento/shared";
import { apiErrorMessage } from "./errors.ts";
import { networkErrorMessage } from "./registration.ts";
// import.meta.env is undefined when the unit tests load this file in node.
const base = import.meta.env?.VITE_API_URL || "/api";
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
  return fetch(`${base}${path}`, { ...init, headers }).catch((error) => {
    throw new Error(networkErrorMessage(error));
  });
}
// A second call while the first is still running shares its result, so a
// double click or a double submit sends one request.
function singleFlight<A extends unknown[], T>(run: (...args: A) => Promise<T>) {
  let pending: Promise<T> | undefined;
  return (...args: A) =>
    (pending ??= run(...args).finally(() => {
      pending = undefined;
    }));
}
async function parse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(apiErrorMessage(body, response.status)), {
      status: response.status,
    });
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
  return startSession(session);
}
// An account without a shop is let in too: it can only open shop setup.
async function startSession(session: {
  accessToken: string;
  refreshToken: string;
}): Promise<PanelAccess> {
  accessToken = session.accessToken;
  refreshToken = session.refreshToken;
  try {
    const access = await api<PanelAccess>("/auth/panel-access");
    platformSession = access.isPlatformAdmin;
    return access;
  } catch (error) {
    await logout();
    throw error;
  }
}
export const register = singleFlight(
  async (input: {
    name: string;
    email: string;
    password: string;
  }): Promise<PanelAccess> =>
    startSession(
      await parse<{ accessToken: string; refreshToken: string }>(
        await send("/auth/register", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      ),
    ),
);
/** Creates a shop owned by the signed-in user and returns the updated access. */
export const createShop = singleFlight(
  async (input: { name: string; slug: string }) => {
    const shop = await api<PanelAccess["shops"][number]>("/businesses", {
      method: "POST",
      body: JSON.stringify({
        name: input.name.trim(),
        slug: shopIdFrom(input.slug),
      }),
    });
    const access = await api<PanelAccess>("/auth/panel-access");
    return { shop, access };
  },
);
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
