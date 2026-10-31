import { describe, expect, it } from 'vitest';

import { DEFAULT_ROLE_PERMISSIONS } from './permissions.js';

describe('default role permissions', () => {
  it('lets only owners and admins cancel bills', () => {
    for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
      const cancels = ['sales.cancel', 'purchases.cancel'].map((permission) => DEFAULT_ROLE_PERMISSIONS[role].includes(permission as never));
      expect(cancels, role).toEqual(['OWNER', 'ADMIN'].includes(role) ? [true, true] : [false, false]);
    }
  });
});
