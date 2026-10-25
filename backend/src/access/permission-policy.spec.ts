import { PATH_METADATA } from '@nestjs/common/constants.js';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  clientRoutePermissions,
  isPermission,
} from '@invento/shared';
import { operationPermission } from './business-permission.guard.js';
import { requireBusinessPermission } from '../auth/business-access.js';
import { ProductsController } from '../products/products.controller.js';
import { InventoryController } from '../inventory/inventory.controller.js';
import { CustomersController } from '../customers/customers.controller.js';
import { SuppliersController } from '../suppliers/suppliers.controller.js';
import { SalesController } from '../sales/sales.controller.js';
import { PurchasesController } from '../purchases/purchases.controller.js';
import { DashboardController } from '../dashboard/dashboard.controller.js';
import { FilesController } from '../files/files.controller.js';
import { SyncController } from '../sync/sync.controller.js';
import { BusinessesController } from '../businesses/businesses.controller.js';
import { AccessManagementController } from './access.controller.js';

describe('Permission policy completeness and default denial', () => {
  it('maps every current business HTTP handler to a recognized permission', () => {
    for (const controller of [
      ProductsController,
      InventoryController,
      CustomersController,
      SuppliersController,
      SalesController,
      PurchasesController,
      DashboardController,
      FilesController,
      SyncController,
      BusinessesController,
      AccessManagementController,
    ]) {
      for (const key of Object.getOwnPropertyNames(controller.prototype)) {
        const handler =
          controller.prototype[key as keyof typeof controller.prototype];
        if (
          key === 'constructor' ||
          typeof handler !== 'function' ||
          !Reflect.hasMetadata(PATH_METADATA, handler)
        )
          continue;
        if (
          controller === BusinessesController &&
          ['create', 'list'].includes(key)
        )
          continue;
        expect(
          isPermission(operationPermission(controller.name, key)),
          `${controller.name}.${key}`,
        ).toBe(true);
      }
    }
    expect(
      operationPermission('ProductsController', 'newUnmappedEndpoint'),
    ).toBeNull();
    expect(operationPermission('UnknownController', 'create')).toBeNull();
  });
  it('keeps all default grants in the code catalog and ownership fully privileged', () => {
    for (const permissions of Object.values(DEFAULT_ROLE_PERMISSIONS))
      expect(permissions.every(isPermission)).toBe(true);
    expect(DEFAULT_ROLE_PERMISSIONS.OWNER).toEqual([...PERMISSIONS]);
    expect(DEFAULT_ROLE_PERMISSIONS.VIEWER).not.toContain('roles.manage');
    expect(DEFAULT_ROLE_PERMISSIONS.SALESPERSON).toContain('sales.create');
    expect(DEFAULT_ROLE_PERMISSIONS.SALESPERSON).not.toContain(
      'purchases.create',
    );
  });
  it('uses current role permissions rather than a role-name allowlist or token claims', async () => {
    const membership = {
      isActive: true,
      role: 'CUSTOM',
      user: { isActive: true },
      business: { isActive: true },
      roleDefinition: { permissions: ['products.create'] },
    };
    const db = {
      businessUser: {
        findUnique: vi.fn().mockImplementation(async () => membership),
      },
    };
    await expect(
      requireBusinessPermission(db as never, 'u', 'b', 'products.create'),
    ).resolves.toMatchObject({ role: 'CUSTOM' });
    membership.roleDefinition.permissions = [];
    await expect(
      requireBusinessPermission(db as never, 'u', 'b', 'products.create'),
    ).rejects.toThrow('products.create');
    membership.roleDefinition.permissions = ['platform.root'];
    await expect(
      requireBusinessPermission(db as never, 'u', 'b', 'products.create'),
    ).rejects.toThrow('products.create');
    membership.roleDefinition.permissions = ['products.create'];
    membership.user.isActive = false;
    await expect(
      requireBusinessPermission(db as never, 'u', 'b', 'products.create'),
    ).rejects.toThrow('unavailable');
  });
  it.each([
    ['/product/new', ['products.create']],
    ['/product/abc', ['products.view']],
    ['/sale/quick', ['sales.create']],
    ['/purchase/create', ['purchases.create']],
    ['/people/suppliers/abc', ['suppliers.view']],
    ['/settings/access', ['members.view', 'roles.view']],
  ])('gates direct client navigation to %s', (path, permissions) => {
    expect(clientRoutePermissions(path as string)).toEqual(permissions);
  });
});
