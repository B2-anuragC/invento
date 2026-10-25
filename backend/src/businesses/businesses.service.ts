import { DEFAULT_ROLE_PERMISSIONS } from '@invento/shared';
import { AccessManagementService, lockBusiness, lockAuthorizationChanges } from '../access/access.service.js';
import { requireBusinessMembership, requireBusinessPermission } from '../auth/business-access.js';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';


@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: { name: string; slug: string; email?: string; phone?: string; address?: string }) {
    return this.prisma.$transaction(async (tx) => {
      await lockAuthorizationChanges(tx);
      const account = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true } });
      if (!account?.isActive) throw new ForbiddenException('Account is inactive.');
      const business = await tx.business.create({ data: { name: input.name.trim(), slug: input.slug.trim().toLowerCase(), email: input.email?.trim().toLowerCase(), phone: input.phone?.trim(), address: input.address?.trim() } });
      await tx.businessRole.createMany({ data: Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([key, permissions]) => ({ businessId: business.id, key, name: key[0] + key.slice(1).toLowerCase(), permissions: [...permissions], isSystem: true })) });
      await tx.businessUser.create({ data: { businessId: business.id, userId, role: 'OWNER' } });
      await tx.platformAuditLog.create({ data: { actorId: userId, businessId: business.id, action: 'BUSINESS_OWNER_CREATED', targetType: 'membership', targetId: userId, reason: 'Business creation', previous: {}, next: { role: 'OWNER', isActive: true } } });
      return business;
    });
  }

  async listForUser(userId: string) {
    return this.prisma.businessUser.findMany({
      where: { userId, isActive: true, business: { isActive: true } },
      select: {
        role: true,
        business: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { business: { name: 'asc' } },
    });
  }

  async get(userId: string, businessId: string) {
    await this.requireMembership(userId, businessId);
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    return business;
  }

  async update(userId: string, businessId: string, input: { name?: string; email?: string; phone?: string; address?: string }) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'business.update');
    return this.prisma.business.update({ where: { id: businessId }, data: { ...input, email: input.email?.trim().toLowerCase(), name: input.name?.trim() } });
  }

  async listUsers(userId: string, businessId: string) {
    await requireBusinessPermission(this.prisma, userId, businessId, 'members.view');
    return this.prisma.businessUser.findMany({
      where: { businessId, isActive: true },
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } } },
    });
  }

  async getPricingAccess(userId: string, businessId: string) {
    const membership = await this.requireMembership(userId, businessId);
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { membersCanViewPurchasePrice: true },
    });
    if (!business) throw new NotFoundException('Business not found.');
    return { membersCanViewPurchasePrice: business.membersCanViewPurchasePrice, role: membership.role, permissions: membership.permissions };
  }

  async updatePricingAccess(userId: string, businessId: string, membersCanViewPurchasePrice: boolean) {
    return this.prisma.$transaction(async (tx) => {
      await lockAuthorizationChanges(tx);
      await lockBusiness(tx, businessId);
      const actor = await requireBusinessPermission(tx as PrismaService, userId, businessId, 'pricing.manage');
      if (actor.role === 'MEMBER' || (membersCanViewPurchasePrice && !actor.permissions.includes('pricing.view'))) throw new ForbiddenException('Cannot grant purchase-price access beyond your authority.');
      const role = await tx.businessRole.findUnique({ where: { businessId_key: { businessId, key: 'MEMBER' } } });
      const previous = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { membersCanViewPurchasePrice: true } });
      const updated = await tx.business.update({ where: { id: businessId }, data: { membersCanViewPurchasePrice }, select: { membersCanViewPurchasePrice: true } });
      if (role) await tx.businessRole.update({ where: { businessId_key: { businessId, key: 'MEMBER' } }, data: { permissions: membersCanViewPurchasePrice ? [...new Set([...role.permissions, 'pricing.view'])] : role.permissions.filter(p => p !== 'pricing.view') } });
      await tx.platformAuditLog.create({ data: { actorId: userId, businessId, action: 'LEGACY_MEMBER_PRICING_CHANGED', targetType: 'role', targetId: 'MEMBER', reason: 'Purchase price visibility setting', previous, next: { membersCanViewPurchasePrice } } });
      return updated;
    });
  }

  async addUser(actorId: string, businessId: string, email: string, role: string) {
    return new AccessManagementService(this.prisma).addMember(actorId, businessId, { email, role });
  }
  async updateUser(actorId: string, businessId: string, userId: string, role: string) {
    return new AccessManagementService(this.prisma).updateMember(actorId, businessId, userId, { role });
  }
  async removeUser(actorId: string, businessId: string, userId: string) {
    await new AccessManagementService(this.prisma).updateMember(actorId, businessId, userId, { isActive: false });
    return { removed: true };
  }
  private async requireMembership(userId: string, businessId: string) {
    return requireBusinessMembership(this.prisma, userId, businessId);
  }
}
