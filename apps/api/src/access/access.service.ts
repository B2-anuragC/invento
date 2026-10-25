import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS, isPermission, type Permission } from '@invento/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  requireBusinessMembership,
  requireBusinessPermission,
} from '../auth/business-access.js';
import {
  AddMemberDto,
  CreateRoleDto,
  UpdateMemberDto,
  UpdateRoleDto,
} from './access.dto.js';
const userSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
} as const;
// Account status and ownership changes share a lifecycle lock so a new owner
// membership cannot appear between account-suspension discovery and validation.
export async function lockAuthorizationChanges(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(80241025)`;
}
export async function lockBusiness(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`business-access:${id}`}, 0))`;
}
@Injectable()
export class AccessManagementService {
  constructor(private readonly prisma: PrismaService) {}
  async me(userId: string, businessId: string) {
    const membership = await requireBusinessMembership(
      this.prisma,
      userId,
      businessId,
    );
    return {
      userId,
      businessId,
      role: membership.role,
      permissions: membership.permissions,
      platformAccess: membership.platformAccess,
    };
  }
  async roles(userId: string, businessId: string) {
    await requireBusinessPermission(
      this.prisma,
      userId,
      businessId,
      'roles.view',
    );
    return this.prisma.businessRole.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }
  async catalog(userId: string, businessId: string) {
    await requireBusinessPermission(
      this.prisma,
      userId,
      businessId,
      'roles.view',
    );
    return PERMISSIONS;
  }
  async members(userId: string, businessId: string) {
    await requireBusinessPermission(
      this.prisma,
      userId,
      businessId,
      'members.view',
    );
    return this.prisma.businessUser.findMany({
      where: { businessId },
      select: {
        id: true,
        role: true,
        isActive: true,
        createdAt: true,
        user: { select: userSelect },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  async audit(userId: string, businessId: string) {
    await requireBusinessPermission(
      this.prisma,
      userId,
      businessId,
      'audit.view',
    );
    return this.prisma.platformAuditLog.findMany({
      where: { businessId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }
  private async mutate<T>(
    actorId: string,
    businessId: string,
    permission: Permission,
    work: (
      tx: Prisma.TransactionClient,
      actor: Awaited<ReturnType<typeof requireBusinessMembership>>,
    ) => Promise<T>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockAuthorizationChanges(tx);
      await lockBusiness(tx, businessId);
      const actor = await requireBusinessPermission(
        tx as PrismaService,
        actorId,
        businessId,
        permission,
      );
      return work(tx, actor);
    });
  }
  private subset(
    permissions: readonly string[],
    actor: { permissions: readonly string[] },
  ) {
    if (
      permissions.some(
        (p) => !isPermission(p) || !actor.permissions.includes(p),
      )
    )
      throw new ForbiddenException(
        'Cannot manage or grant permissions beyond your authority.',
      );
  }
  private log(
    tx: Prisma.TransactionClient,
    actorId: string,
    businessId: string,
    action: string,
    targetType: string,
    targetId: string,
    previous: Prisma.InputJsonObject,
    next: Prisma.InputJsonObject,
  ) {
    return tx.platformAuditLog.create({
      data: {
        actorId,
        businessId,
        action,
        targetType,
        targetId,
        reason: 'Business access management',
        previous,
        next,
      },
    });
  }
  async createRole(actorId: string, businessId: string, input: CreateRoleDto) {
    return this.mutate(
      actorId,
      businessId,
      'roles.manage',
      async (tx, actor) => {
        if (input.key === 'OWNER')
          throw new ForbiddenException('Owner is a protected role.');
        this.subset(input.permissions, actor);
        const role = await tx.businessRole.create({
          data: {
            businessId,
            key: input.key,
            name: input.name.trim(),
            permissions: input.permissions,
          },
        });
        await this.log(
          tx,
          actorId,
          businessId,
          'ROLE_CREATED',
          'role',
          role.key,
          {},
          { key: role.key, name: role.name, permissions: role.permissions },
        );
        return role;
      },
    );
  }
  async updateRole(
    actorId: string,
    businessId: string,
    key: string,
    input: UpdateRoleDto,
    remove = false,
  ) {
    return this.mutate(
      actorId,
      businessId,
      'roles.manage',
      async (tx, actor) => {
        if (key === 'OWNER' || key === actor.role)
          throw new ForbiddenException(
            'Cannot change the owner role or your own assigned role.',
          );
        const role = await tx.businessRole.findUnique({
          where: { businessId_key: { businessId, key } },
        });
        if (!role)
          throw new NotFoundException('Role not found in this business.');
        this.subset(role.permissions, actor);
        this.subset(input.permissions ?? role.permissions, actor);
        if (remove) {
          if (await tx.businessUser.count({ where: { businessId, role: key } }))
            throw new BadRequestException(
              'Reassign all active and inactive memberships before deleting this role.',
            );
          await tx.businessRole.delete({
            where: { businessId_key: { businessId, key } },
          });
        } else
          await tx.businessRole.update({
            where: { businessId_key: { businessId, key } },
            data: { name: input.name?.trim(), permissions: input.permissions },
          });
        await this.log(
          tx,
          actorId,
          businessId,
          remove ? 'ROLE_DELETED' : 'ROLE_UPDATED',
          'role',
          key,
          { name: role.name, permissions: role.permissions },
          remove
            ? { deleted: true }
            : {
                name: input.name ?? role.name,
                permissions: input.permissions ?? role.permissions,
              },
        );
        return { changed: true };
      },
    );
  }
  async addMember(actorId: string, businessId: string, input: AddMemberDto) {
    return this.mutate(
      actorId,
      businessId,
      'members.invite',
      async (tx, actor) => {
        const user = await tx.user.findUnique({
          where: { email: input.email.trim().toLowerCase() },
          select: userSelect,
        });
        if (!user?.isActive)
          throw new NotFoundException(
            'An existing active account is required.',
          );
        if (user.id === actorId)
          throw new ForbiddenException('Cannot change your own membership.');
        const existing = await tx.businessUser.findUnique({
          where: { businessId_userId: { businessId, userId: user.id } },
          include: { roleDefinition: true },
        });
        if (existing)
          throw new BadRequestException(
            'Membership exists. Use membership management to reactivate or change it.',
          );
        await this.assignableRole(tx, businessId, input.role, actor);
        const member = await tx.businessUser.create({
          data: { businessId, userId: user.id, role: input.role },
          select: {
            id: true,
            role: true,
            isActive: true,
            user: { select: userSelect },
          },
        });
        await this.log(
          tx,
          actorId,
          businessId,
          'MEMBER_ADDED',
          'membership',
          user.id,
          {},
          { role: input.role, isActive: true },
        );
        return member;
      },
    );
  }
  private async assignableRole(
    tx: Prisma.TransactionClient,
    businessId: string,
    key: string,
    actor: { role: string; permissions: readonly string[] },
  ) {
    const role = await tx.businessRole.findUnique({
      where: { businessId_key: { businessId, key } },
    });
    if (!role) throw new NotFoundException('Role not found in this business.');
    if (key === 'OWNER' && actor.role !== 'OWNER')
      throw new ForbiddenException('Only an owner may assign ownership.');
    this.subset(key === 'OWNER' ? PERMISSIONS : role.permissions, actor);
    return role;
  }
  async updateMember(
    actorId: string,
    businessId: string,
    userId: string,
    input: UpdateMemberDto,
  ) {
    return this.mutate(
      actorId,
      businessId,
      'members.update',
      async (tx, actor) => {
        if (actorId === userId)
          throw new ForbiddenException('Cannot change your own membership.');
        if (
          input.isActive === false &&
          !actor.permissions.includes('members.remove')
        )
          throw new ForbiddenException('Permission required: members.remove');
        const target = await tx.businessUser.findUnique({
          where: { businessId_userId: { businessId, userId } },
          include: {
            roleDefinition: true,
            user: { select: { isActive: true } },
          },
        });
        if (!target)
          throw new NotFoundException('Membership not found in this business.');
        if (target.role === 'OWNER' && actor.role !== 'OWNER')
          throw new ForbiddenException('Only an owner may manage an owner.');
        this.subset(
          target.role === 'OWNER'
            ? PERMISSIONS
            : target.roleDefinition.permissions,
          actor,
        );
        const role = input.role ?? target.role;
        await this.assignableRole(tx, businessId, role, actor);
        if (input.isActive === true && !target.user.isActive)
          throw new BadRequestException('Account is suspended.');
        if (
          target.role === 'OWNER' &&
          target.isActive &&
          target.user.isActive &&
          (role !== 'OWNER' || input.isActive === false)
        ) {
          const owners = await tx.businessUser.count({
            where: {
              businessId,
              role: 'OWNER',
              isActive: true,
              user: { isActive: true },
            },
          });
          if (owners <= 1)
            throw new ForbiddenException(
              'The last active owner cannot be removed or demoted.',
            );
        }
        const result = await tx.businessUser.update({
          where: { businessId_userId: { businessId, userId } },
          data: { role, isActive: input.isActive },
          select: {
            id: true,
            role: true,
            isActive: true,
            user: { select: userSelect },
          },
        });
        await this.log(
          tx,
          actorId,
          businessId,
          'MEMBER_UPDATED',
          'membership',
          userId,
          { role: target.role, isActive: target.isActive },
          { role, isActive: result.isActive },
        );
        return result;
      },
    );
  }
}
