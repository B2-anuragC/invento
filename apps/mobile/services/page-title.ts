/**
 * The browser tab title for a route on web ("Sales · Invento"), so tabs,
 * history and screen readers say which page is open.
 */
const FIXED: Record<string, string> = {
  '/': 'Overview',
  '/index': 'Overview',
  '/products': 'Catalog',
  '/sales': 'Sales',
  '/purchases': 'Purchases',
  '/people': 'People',
  '/activity': 'Activity',
  '/inventory': 'Inventory',
  '/profile': 'Your account',
  '/auth/login': 'Sign in',
  '/auth/register': 'Create your account',
  '/business/setup': 'Choose your shop',
  '/sale/quick': 'Quick bill',
  '/sale/create': 'New sale',
  '/purchase/create': 'New purchase',
  '/product/new': 'New product',
  '/inventory/adjust': 'Adjust stock',
  '/settings/access': 'Users & permissions',
  '/settings/pricing': 'Pricing & access',
  '/settings/shop': 'Shop details',
  '/settings/sync': 'Sync status',
  '/calculator/glass': 'Glass calculator',
  '/modal': 'Invento',
};

export function pageTitle(pathname: string): string {
  const path = (pathname.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
  const fixed = FIXED[path];
  const [, first, second, third] = path.split('/');
  const name =
    fixed ??
    (first === 'sale' ? 'Sale' :
      first === 'purchase' ? 'Purchase' :
        first === 'product' ? 'Product' :
          first === 'people' && (second === 'customers' || second === 'suppliers')
            ? third === 'new'
              ? `New ${second === 'customers' ? 'customer' : 'supplier'}`
              : second === 'customers' ? 'Customer' : 'Supplier'
            : null);
  return name && name !== 'Invento' ? `${name} · Invento` : 'Invento';
}
