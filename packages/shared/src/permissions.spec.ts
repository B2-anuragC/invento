import { describe, expect, it } from 'vitest';

import { DEFAULT_ROLE_PERMISSIONS, clientRoutePermissions } from './permissions.js';

describe('default role permissions', () => {
  it('lets only owners and admins cancel bills and record returns', () => {
    for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
      const cancels = ['sales.cancel', 'purchases.cancel', 'sales.return', 'purchases.return'].map((permission) => DEFAULT_ROLE_PERMISSIONS[role].includes(permission as never));
      expect(cancels, role).toEqual(['OWNER', 'ADMIN'].includes(role) ? [true, true, true, true] : [false, false, false, false]);
    }
  });
});

describe('clientRoutePermissions', () => {
  it('guards the stock adjustment screen with inventory.adjust and the tab with inventory.view', () => {
    expect(clientRoutePermissions('/inventory/adjust')).toEqual(['inventory.adjust']);
    expect(clientRoutePermissions('/inventory')).toEqual(['inventory.view']);
  });
});
