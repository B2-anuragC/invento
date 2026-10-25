import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS, isPermission, type Permission } from '@invento/shared';
import type { PrismaService } from '../prisma/prisma.service.js';

export const supportAccess = new AsyncLocalStorage<{
  userId: string;
  businessId: string;
  auditId?: string;
}>();
export async function requireBusinessMembership(
  prisma: PrismaService,
  userId: string,
  businessId: string,
  allowPlatform = true,
) {
  const support = supportAccess.getStore();
  if (
    allowPlatform &&
    support?.userId === userId &&
    support.businessId === businessId
  ) {
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, isPlatformAdmin: true },
    });
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { isActive: true },
    });
    if (account?.isActive && account.isPlatformAdmin && business?.isActive)
      return {
        businessId,
        userId,
        role: 'PLATFORM_SUPPORT',
        isActive: true,
        business,
        permissions: [...PERMISSIONS],
        platformAccess: true,
      };
  }
  const membership = await prisma.businessUser.findUnique({
    where: { businessId_userId: { businessId, userId } },
    include: {
      business: {
        select: { isActive: true, membersCanViewPurchasePrice: true },
      },
      user: { select: { isActive: true } },
      roleDefinition: true,
    },
  });
  if (
    membership?.isActive &&
    membership.business?.isActive &&
    membership.user?.isActive !== false
  ) {
    const permissions: Permission[] =
      membership.role === 'OWNER'
        ? [...PERMISSIONS]
        : (membership.roleDefinition?.permissions ?? []).filter(isPermission);
    return { ...membership, permissions, platformAccess: false };
  }
  throw new ForbiddenException('Business access is unavailable.');
}
export async function requireBusinessPermission(
  prisma: PrismaService,
  userId: string,
  businessId: string,
  permission: Permission,
) {
  const access = await requireBusinessMembership(prisma, userId, businessId);
  if (!access.permissions.includes(permission))
    throw new ForbiddenException(`Permission required: ${permission}`);
  return access;
}
