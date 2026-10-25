import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Enforce tenant access using current database permissions, never client roles. */
export async function requireBusinessMembership(
  prisma: PrismaService,
  userId: string,
  businessId: string,
  allowPlatform = true,
) {
  const membership = await prisma.businessUser.findUnique({
    where: { businessId_userId: { businessId, userId } },
    include: {
      business: { select: { isActive: true } },
      user: { select: { isPlatformAdmin: true } },
    },
  });
  if (membership?.isActive && membership.business.isActive) {
    return allowPlatform && membership.user?.isPlatformAdmin
      ? { ...membership, role: 'OWNER' }
      : membership;
  }
  // Platform operators can manage any active shop without creating a membership.
  // Suspended shops must first be reactivated through the audited platform API.
  if (allowPlatform) {
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, isPlatformAdmin: true },
    });
    if (account?.isActive && account.isPlatformAdmin) {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { isActive: true },
      });
      if (business?.isActive)
        return { businessId, userId, role: 'OWNER', isActive: true, business };
    }
  }
  throw new ForbiddenException('Business access is unavailable.');
}
