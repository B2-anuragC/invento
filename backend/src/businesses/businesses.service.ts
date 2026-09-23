import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type Role = 'OWNER' | 'ADMIN' | 'MEMBER';
const managerRoles: Role[] = ['OWNER', 'ADMIN'];

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: { name: string; slug: string; email?: string; phone?: string; address?: string }) {
    return this.prisma.business.create({
      data: {
        name: input.name.trim(), slug: input.slug.trim().toLowerCase(), email: input.email?.trim().toLowerCase(),
        phone: input.phone?.trim(), address: input.address?.trim(), users: { create: { userId, role: 'OWNER' } },
      },
    });
  }

  async get(userId: string, businessId: string) {
    await this.requireMembership(userId, businessId);
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    return business;
  }

  async update(userId: string, businessId: string, input: { name?: string; email?: string; phone?: string; address?: string }) {
    await this.requireRole(userId, businessId, managerRoles);
    return this.prisma.business.update({ where: { id: businessId }, data: { ...input, email: input.email?.trim().toLowerCase(), name: input.name?.trim() } });
  }

  async listUsers(userId: string, businessId: string) {
    await this.requireMembership(userId, businessId);
    return this.prisma.businessUser.findMany({
      where: { businessId, isActive: true },
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } } },
    });
  }

  async addUser(actorId: string, businessId: string, email: string, role: 'ADMIN' | 'MEMBER') {
    await this.requireRole(actorId, businessId, managerRoles);
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !user.isActive) throw new NotFoundException('User not found.');
    const existing = await this.prisma.businessUser.findUnique({ where: { businessId_userId: { businessId, userId: user.id } } });
    if (existing?.isActive) throw new ForbiddenException('User is already a member of this business.');
    return this.prisma.businessUser.upsert({
      where: { businessId_userId: { businessId, userId: user.id } },
      update: { role, isActive: true },
      create: { businessId, userId: user.id, role },
      select: { id: true, role: true, isActive: true, user: { select: { id: true, name: true, email: true } } },
    });
  }

  async updateUser(actorId: string, businessId: string, userId: string, role: Role) {
    const actor = await this.requireRole(actorId, businessId, managerRoles);
    const target = await this.requireMembership(userId, businessId);
    if (target.role === 'OWNER' && role !== 'OWNER') throw new ForbiddenException('Owner memberships cannot be demoted.');
    if (target.role === 'OWNER' && actor.role !== 'OWNER') throw new ForbiddenException('Only the owner can change an owner membership.');
    if (role === 'OWNER' && actor.role !== 'OWNER') throw new ForbiddenException('Only the owner can assign owner membership.');
    return this.prisma.businessUser.update({ where: { businessId_userId: { businessId, userId } }, data: { role } });
  }

  async removeUser(actorId: string, businessId: string, userId: string) {
    const actor = await this.requireRole(actorId, businessId, managerRoles);
    const target = await this.requireMembership(userId, businessId);
    if (target.role === 'OWNER') throw new ForbiddenException('An owner membership cannot be removed.');
    if (actor.role === 'ADMIN' && target.role === 'ADMIN') throw new ForbiddenException('Administrators cannot remove another administrator.');
    await this.prisma.businessUser.update({ where: { businessId_userId: { businessId, userId } }, data: { isActive: false } });
    return { removed: true };
  }

  private async requireMembership(userId: string, businessId: string) {
    const membership = await this.prisma.businessUser.findUnique({ where: { businessId_userId: { businessId, userId } } });
    if (!membership?.isActive) throw new ForbiddenException('You do not have access to this business.');
    return membership;
  }

  private async requireRole(userId: string, businessId: string, roles: Role[]) {
    const membership = await this.requireMembership(userId, businessId);
    if (!roles.includes(membership.role as Role)) throw new ForbiddenException('You do not have permission for this action.');
    return membership;
  }
}
