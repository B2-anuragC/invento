import { describe, expect, it } from 'vitest';

import {
  addMemberConfirmation,
  assignableRoles,
  membershipStatusConfirmation,
  roleChangeConfirmation,
  roleDeletion,
  roleDescription,
  roleName,
} from './access-changes.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, type BusinessRoleRecord, type Permission } from './permissions.js';

const roles: BusinessRoleRecord[] = [
  ...['OWNER', 'ADMIN', 'MANAGER', 'SALESPERSON', 'VIEWER'].map((key) => ({
    key,
    name: key[0] + key.slice(1).toLowerCase(),
    permissions: [...DEFAULT_ROLE_PERMISSIONS[key]],
    isSystem: true,
  })),
  { key: 'CASHIER', name: 'Cashier', permissions: ['sales.view', 'sales.create'], isSystem: false },
];
const member = (name: string, role: string, isActive = true) => ({
  id: `m-${name}`,
  role,
  isActive,
  user: { id: `u-${name}`, name, email: `${name.toLowerCase()}@example.com`, isActive: true },
});

describe('role names and descriptions', () => {
  it('uses the role name, else the key in words', () => {
    expect(roleName(roles, 'MANAGER')).toBe('Manager');
    expect(roleName(roles, 'STORE_KEEPER')).toBe('Store keeper');
    expect(roleName(null, 'OWNER')).toBe('Owner');
  });

  it('describes built-in roles and counts custom role permissions', () => {
    expect(roleDescription(roles[0])).toMatch(/Everything, including owners/);
    expect(roleDescription(roles[5])).toBe(`Custom role · 2 of ${PERMISSIONS.length} permissions`);
    expect(roleDescription({ key: 'ALL', permissions: [...PERMISSIONS] })).toBe('Custom role · all permissions');
  });
});

describe('assignableRoles', () => {
  it('offers Owner only to owners and never more than the actor has', () => {
    expect(assignableRoles(roles, { role: 'OWNER', permissions: [...PERMISSIONS] }).map((r) => r.key)).toEqual(roles.map((r) => r.key));
    expect(assignableRoles(roles, { role: 'ADMIN', permissions: [...PERMISSIONS] }).map((r) => r.key)).not.toContain('OWNER');
    const manager = assignableRoles(roles, { role: 'MANAGER', permissions: [...DEFAULT_ROLE_PERMISSIONS.MANAGER] as Permission[] }).map((r) => r.key);
    expect(manager).toEqual(['MANAGER', 'SALESPERSON', 'VIEWER', 'CASHIER']);
  });
});

describe('confirmations', () => {
  it('confirms making someone an owner and taking owner away, but not other changes', () => {
    expect(roleChangeConfirmation(member('Ravi', 'MANAGER'), 'OWNER', roles)).toMatchObject({ title: 'Make Ravi an owner?', confirmLabel: 'Make owner', danger: false });
    expect(roleChangeConfirmation(member('Sita', 'OWNER'), 'ADMIN', roles)).toMatchObject({
      title: 'Remove owner access from Sita?',
      message: expect.stringContaining('will become Admin'),
      danger: true,
    });
    expect(roleChangeConfirmation(member('Ravi', 'MANAGER'), 'VIEWER', roles)).toBeNull();
    expect(roleChangeConfirmation(member('Ravi', 'OWNER'), 'OWNER', roles)).toBeNull();
  });

  it('confirms adding an account as an owner only', () => {
    expect(addMemberConfirmation(' new@example.com ', 'OWNER')).toMatchObject({ title: 'Add new@example.com as an owner?', confirmLabel: 'Add as owner' });
    expect(addMemberConfirmation('', 'OWNER')?.title).toBe('Add this account as an owner?');
    expect(addMemberConfirmation('new@example.com', 'MANAGER')).toBeNull();
  });

  it('confirms deactivating but not reactivating', () => {
    expect(membershipStatusConfirmation(member('Ravi', 'VIEWER'))).toMatchObject({ title: 'Deactivate Ravi?', confirmLabel: 'Deactivate', danger: true });
    expect(membershipStatusConfirmation(member('Ravi', 'VIEWER', false))).toBeNull();
  });

  it('blocks deleting a role members still have and confirms otherwise', () => {
    const team = [member('Ravi', 'CASHIER'), member('Sita', 'CASHIER', false), member('Amit', 'VIEWER')];
    expect(roleDeletion(roles[5], team)).toEqual({ blocked: '2 members have the Cashier role (Ravi, Sita). Give each of them another role before deleting it.' });
    expect(roleDeletion(roles[5], [member('Ravi', 'CASHIER')])).toEqual({ blocked: '1 member has the Cashier role (Ravi). Give them another role before deleting it.' });
    const many = ['A', 'B', 'C', 'D', 'E'].map((n) => member(n, 'CASHIER'));
    expect('blocked' in roleDeletion(roles[5], many) && roleDeletion(roles[5], many)).toMatchObject({ blocked: expect.stringContaining('(A, B, C and 2 more)') });
    expect(roleDeletion(roles[5], [member('Amit', 'VIEWER')])).toMatchObject({ confirm: { title: 'Delete the Cashier role?', message: 'No one has this role. Deleting it cannot be undone.', danger: true } });
    expect(roleDeletion(roles[5], null)).toMatchObject({ confirm: { message: expect.stringContaining('cannot be deleted') } });
  });
});
