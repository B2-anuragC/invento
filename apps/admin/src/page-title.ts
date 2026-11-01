// Browser tab titles, so tabs, history and screen readers say which page is open.
const APP = "Invento admin";

const platformPages: Record<string, [list: string, detail: string]> = {
  overview: ["Overview", "Overview"],
  businesses: ["Businesses", "Business"],
  users: ["Users", "User"],
  "audit-logs": ["Audit log", "Audit log"],
  roles: ["Businesses", "Businesses"],
};

/** Title for a hash route ("/businesses/abc") outside a shop's workspace. */
export function platformPageTitle(route: string | null): string {
  if (route === null) return `Sign in · ${APP}`;
  const [, section = "", id] = route.split("/");
  const page = platformPages[section];
  if (!page) return section === "shops" ? `Businesses · ${APP}` : `Page not found · ${APP}`;
  return `${id ? page[1] : page[0]} · ${APP}`;
}

/** Title inside a shop's workspace: the open tab, then the shop. */
export function shopPageTitle(sectionTitle: string, shopName?: string): string {
  return [sectionTitle, shopName?.trim(), APP].filter(Boolean).join(" · ");
}
