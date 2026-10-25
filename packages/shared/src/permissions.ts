/** Permission identifiers are application code, never administrator-supplied capabilities. */
export const PERMISSIONS = [
  "business.view",
  "business.update",
  "pricing.manage",
  "pricing.view",
  "products.view",
  "products.create",
  "products.update",
  "products.delete",
  "inventory.view",
  "inventory.adjust",
  "customers.view",
  "customers.create",
  "customers.update",
  "customers.delete",
  "suppliers.view",
  "suppliers.create",
  "suppliers.update",
  "suppliers.delete",
  "sales.view",
  "sales.create",
  "sales.update",
  "sales.payments",
  "purchases.view",
  "purchases.create",
  "purchases.update",
  "purchases.payments",
  "reports.view",
  "members.view",
  "members.invite",
  "members.update",
  "members.remove",
  "roles.view",
  "roles.manage",
  "audit.view",
  "files.upload",
  "files.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const isPermission = (value: unknown): value is Permission =>
  typeof value === "string" &&
  (PERMISSIONS as readonly string[]).includes(value);
export const hasPermission = (
  permissions: readonly string[],
  permission: Permission,
) => permissions.includes(permission);
const reads = PERMISSIONS.filter(
  (p) =>
    p.endsWith(".view") &&
    !["roles.view", "audit.view", "pricing.view"].includes(p),
);
export const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  OWNER: [...PERMISSIONS],
  ADMIN: [...PERMISSIONS],
  MANAGER: PERMISSIONS.filter(
    (p) =>
      !p.startsWith("roles.") &&
      !p.startsWith("members.") &&
      !["business.update", "pricing.manage", "audit.view"].includes(p),
  ),
  SALESPERSON: [
    "business.view",
    "products.view",
    "inventory.view",
    "customers.view",
    "customers.create",
    "customers.update",
    "sales.view",
    "sales.create",
    "files.view",
    "files.upload",
  ],
  VIEWER: reads.filter((p) => !p.startsWith("members.")),
  // Preserve the pre-RBAC MEMBER read surface; legacy purchase-price policy still applies.
  MEMBER: [...reads, "members.view", "pricing.view"],
};
export type EffectiveAccess = {
  userId: string;
  businessId: string;
  role: string;
  permissions: Permission[];
  platformAccess: boolean;
};
export type BusinessRoleRecord = {
  key: string;
  name: string;
  permissions: Permission[];
  isSystem: boolean;
};
export type MembershipRecord = {
  id: string;
  role: string;
  isActive: boolean;
  user: { id: string; name: string; email: string; isActive: boolean };
};

export function clientRoutePermissions(path: string): Permission[] {
  if (
    path.startsWith("/auth/") ||
    path === "/business/setup" ||
    path === "/index"
  )
    return [];
  if (path.includes("settings/access")) return ["members.view", "roles.view"];
  if (path.includes("settings/pricing")) return ["pricing.manage"];
  if (path.startsWith("/product/"))
    return [path.endsWith("/new") ? "products.create" : "products.view"];
  if (path.startsWith("/sale/"))
    return [
      path.endsWith("/create") || path.endsWith("/quick")
        ? "sales.create"
        : "sales.view",
    ];
  if (path.startsWith("/purchase/"))
    return [path.endsWith("/create") ? "purchases.create" : "purchases.view"];
  if (path.startsWith("/people/"))
    return [
      `${path.includes("/suppliers/") ? "suppliers" : "customers"}.${path.endsWith("/new") ? "create" : "view"}` as Permission,
    ];
  const tab = path.split("/").filter(Boolean).pop();
  return (
    (
      {
        products: ["products.view"],
        sales: ["sales.view"],
        purchases: ["purchases.view"],
        people: ["customers.view", "suppliers.view"],
        inventory: ["inventory.view"],
        activity: ["sales.view", "purchases.view"],
      } as Record<string, Permission[]>
    )[tab || ""] ?? (path === "/" ? ["reports.view"] : [])
  );
}
