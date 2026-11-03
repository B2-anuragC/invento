// Where a visitor may go while signing up: create account, then the first
// shop. Kept free of React so the rules can be tested on their own.
import { SHOP_ID_MAX, shopIdFrom } from "@invento/shared";

type Access = { isPlatformAdmin: boolean; shops: readonly unknown[] } | null;

/** The first page after signing in or creating an account. */
export function entryRoute(access: NonNullable<Access>): string {
  if (access.isPlatformAdmin) return "/overview";
  return access.shops.length ? "/shops" : "/setup";
}

/** The route to show for the requested one, redirecting where it is not allowed. */
export function guardRoute(route: string, access: Access): string {
  if (!access) return route === "/register" ? "/register" : "/login";
  if (route === "/register" || route === "/login") return entryRoute(access);
  // Platform admins manage shops through the directory, not by joining them.
  if (access.isPlatformAdmin) return route === "/setup" ? "/overview" : route;
  return access.shops.length ? route : "/setup";
}

export type ShopIdState = { shopId: string; edited: boolean };

/** The shop ID follows the business name until the owner types their own. */
export function nextShopId(state: ShopIdState, change: { name: string } | { shopId: string }): ShopIdState {
  if ("shopId" in change) {
    // Keep one trailing hyphen while typing, so "shree hq" can be typed key by
    // key; createShop() trims it before sending.
    const typed = shopIdFrom(change.shopId);
    const separating = typed && typed.length < SHOP_ID_MAX && /[^\p{L}\p{N}]$/u.test(change.shopId);
    return { shopId: separating ? `${typed}-` : typed, edited: true };
  }
  return state.edited ? state : { shopId: shopIdFrom(change.name), edited: false };
}

/** fetch() rejects with a TypeError when the API cannot be reached at all. */
export function networkErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return "Could not reach Invento. Check your connection and try again.";
  return error instanceof Error ? error.message : String(error);
}
