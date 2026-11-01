import { PERMISSIONS, type BusinessRoleRecord, type MembershipRecord, type Permission } from './permissions.js';

/** What each built-in role is for, in the words the role pickers show. */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  OWNER: 'Everything, including owners, roles and shop settings',
  ADMIN: 'Everything except adding or changing owners',
  MANAGER: 'Sales, purchases, stock and contacts; no team, settings, cancelling or returns',
  SALESPERSON: 'Sales and customers only',
  VIEWER: 'Can look at the shop but not change anything',
  MEMBER: 'Older view-only access that includes cost prices',
};

/** A role's name for people ("Manager"), falling back to its key in words. */
export function roleName(roles: readonly BusinessRoleRecord[] | null | undefined, key: string): string {
  const role = roles?.find((r) => r.key === key);
  if (role?.name) return role.name;
  const words = key.toLowerCase().replace(/_+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/** One line on what a role can do: the built-in description, or how many permissions a custom role has. */
export function roleDescription(role: Pick<BusinessRoleRecord, 'key' | 'permissions'>): string {
  const known = ROLE_DESCRIPTIONS[role.key];
  if (known) return known;
  const count = new Set(role.permissions).size;
  return count >= PERMISSIONS.length
    ? 'Custom role · all permissions'
    : `Custom role · ${count} of ${PERMISSIONS.length} permissions`;
}

/**
 * Roles the signed-in member may give to someone: only owners give Owner, and
 * nobody gives a role with permissions they do not have themselves (the server
 * refuses both).
 */
export function assignableRoles(
  roles: readonly BusinessRoleRecord[],
  actor: { role: string; permissions: readonly Permission[] },
): BusinessRoleRecord[] {
  return roles.filter(
    (r) => (r.key !== 'OWNER' || actor.role === 'OWNER') && r.permissions.every((p) => actor.permissions.includes(p)),
  );
}

export type AccessConfirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  /** Takes something away (deactivating, deleting): shown as a danger action. */
  danger: boolean;
};

/**
 * Whether changing a member's role needs a confirmation first. Making someone an
 * owner, or taking owner away, does; other role changes apply straight away.
 */
export function roleChangeConfirmation(
  member: Pick<MembershipRecord, 'role' | 'user'>,
  nextRole: string,
  roles: readonly BusinessRoleRecord[],
): AccessConfirmation | null {
  if (nextRole === member.role) return null;
  const name = member.user.name;
  if (nextRole === 'OWNER')
    return {
      title: `Make ${name} an owner?`,
      message: `${name} will be able to do everything in this shop, including changing or removing other owners and deleting roles. Only an owner can take this away again.`,
      confirmLabel: 'Make owner',
      danger: false,
    };
  if (member.role === 'OWNER')
    return {
      title: `Remove owner access from ${name}?`,
      message: `${name} will become ${roleName(roles, nextRole)} and lose owner access straight away. Only an owner can make them an owner again.`,
      confirmLabel: 'Change role',
      danger: true,
    };
  return null;
}

/** Adding an account as an owner is confirmed like changing a member to owner. */
export function addMemberConfirmation(email: string, role: string): AccessConfirmation | null {
  if (role !== 'OWNER') return null;
  const who = email.trim() || 'this account';
  return {
    title: `Add ${who} as an owner?`,
    message: `${who} will be able to do everything in this shop, including changing or removing other owners and deleting roles. Only an owner can take this away again.`,
    confirmLabel: 'Add as owner',
    danger: false,
  };
}

/** Deactivating a membership is always confirmed; reactivating is not. */
export function membershipStatusConfirmation(member: Pick<MembershipRecord, 'isActive' | 'user'>): AccessConfirmation | null {
  if (!member.isActive) return null;
  const name = member.user.name;
  return {
    title: `Deactivate ${name}?`,
    message: `${name} will lose access to this shop on web and mobile straight away. Their bills and history stay, and you can reactivate the membership later.`,
    confirmLabel: 'Deactivate',
    danger: true,
  };
}

/**
 * Deleting a role: refused while any membership (active or not) still has it,
 * since the server refuses it too; otherwise confirmed, as it cannot be undone.
 * `members` is null when the signed-in member cannot see the team.
 */
export function roleDeletion(
  role: Pick<BusinessRoleRecord, 'key' | 'name'>,
  members: readonly Pick<MembershipRecord, 'role' | 'user'>[] | null,
): { blocked: string } | { confirm: AccessConfirmation } {
  const holders = members?.filter((m) => m.role === role.key) ?? [];
  if (holders.length) {
    const names = holders.map((m) => m.user.name);
    const listed = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
    return {
      blocked: `${holders.length === 1 ? '1 member has' : `${holders.length} members have`} the ${role.name} role (${listed}). Give ${holders.length === 1 ? 'them' : 'each of them'} another role before deleting it.`,
    };
  }
  return {
    confirm: {
      title: `Delete the ${role.name} role?`,
      message:
        members === null
          ? 'This cannot be undone. A role that members still have cannot be deleted.'
          : 'No one has this role. Deleting it cannot be undone.',
      confirmLabel: 'Delete role',
      danger: true,
    },
  };
}
