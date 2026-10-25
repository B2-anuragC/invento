import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AuditQueryDto,
  PageDto,
  PeriodDto,
  ReasonDto,
  StatusDto,
} from './platform-admin.dto.js';

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  isPlatformAdmin: true,
  createdAt: true,
  lastLoginAt: true,
  lastActivityAt: true,
} satisfies Prisma.UserSelect;

export function pageArgs(query: PageDto) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}
export function metricPeriod(query: PeriodDto, now = new Date()) {
  const to = query.to ? new Date(query.to) : now;
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 30 * 86400000);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from >= to ||
    to.getTime() - from.getTime() > 366 * 86400000
  ) {
    throw new BadRequestException(
      'Period must be increasing and no longer than 366 days.',
    );
  }
  return { from, to };
}

@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: PeriodDto) {
    const now = new Date();
    const { from, to } = metricPeriod(query, now);
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const [
      businesses,
      activeBusinesses,
      users,
      products,
      loggedInToday,
      active7Days,
      active30Days,
      sales,
      purchases,
    ] = await Promise.all([
      this.prisma.business.count(),
      this.prisma.business.count({ where: { isActive: true } }),
      this.prisma.user.count(),
      this.prisma.product.count(),
      this.prisma.user.count({
        where: { lastLoginAt: { gte: today, lte: now } },
      }),
      this.prisma.user.count({
        where: {
          lastActivityAt: {
            gte: new Date(now.getTime() - 7 * 86400000),
            lte: now,
          },
        },
      }),
      this.prisma.user.count({
        where: {
          lastActivityAt: {
            gte: new Date(now.getTime() - 30 * 86400000),
            lte: now,
          },
        },
      }),
      this.prisma.sale.count({
        where: { status: 'COMPLETED', saleDate: { gte: from, lt: to } },
      }),
      this.prisma.purchase.count({
        where: { status: 'COMPLETED', purchaseDate: { gte: from, lt: to } },
      }),
    ]);
    return {
      businesses,
      activeBusinesses,
      suspendedBusinesses: businesses - activeBusinesses,
      users,
      products,
      loggedInToday,
      active7Days,
      active30Days,
      sales,
      purchases,
      period: { from, to, timezone: 'UTC', endExclusive: true },
      activityTracking:
        'Since platform-admin migration only. Activity means authenticated API requests; updates are throttled to five minutes. Login excludes registration and token refresh.',
      generatedAt: now,
    };
  }

  async businesses(query: PageDto) {
    const where: Prisma.BusinessWhereInput = {
      ...(query.status ? { isActive: query.status === 'active' } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.business.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          createdAt: true,
          _count: { select: { users: true } },
          users: {
            where: { role: 'OWNER', isActive: true },
            take: 5,
            orderBy: { id: 'asc' },
            select: { user: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.business.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async business(id: string) {
    const row = await this.prisma.business.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        address: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            products: true,
            sales: true,
            purchases: true,
            inventoryTransactions: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Business not found.');
    return row;
  }

  async businessRecords(businessId: string, resource: string, query: PageDto) {
    await this.business(businessId);
    const paging = pageArgs(query);
    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    let result: [unknown[], number];
    switch (resource) {
      case 'members':
        result = await Promise.all([
          this.prisma.businessUser.findMany({
            where: { businessId },
            ...paging,
            orderBy,
            select: {
              id: true,
              role: true,
              isActive: true,
              createdAt: true,
              user: { select: publicUserSelect },
            },
          }),
          this.prisma.businessUser.count({ where: { businessId } }),
        ]);
        break;
      case 'products':
        result = await Promise.all([
          this.prisma.product.findMany({
            where: { businessId },
            ...paging,
            orderBy,
            include: { inventory: { select: { quantity: true } } },
          }),
          this.prisma.product.count({ where: { businessId } }),
        ]);
        break;
      case 'sales':
        result = await Promise.all([
          this.prisma.sale.findMany({
            where: { businessId },
            ...paging,
            orderBy,
          }),
          this.prisma.sale.count({ where: { businessId } }),
        ]);
        break;
      case 'purchases':
        result = await Promise.all([
          this.prisma.purchase.findMany({
            where: { businessId },
            ...paging,
            orderBy,
          }),
          this.prisma.purchase.count({ where: { businessId } }),
        ]);
        break;
      case 'inventory-movements':
        result = await Promise.all([
          this.prisma.inventoryTransaction.findMany({
            where: { businessId },
            ...paging,
            orderBy,
          }),
          this.prisma.inventoryTransaction.count({ where: { businessId } }),
        ]);
        break;
      default:
        throw new NotFoundException('Business resource not found.');
    }
    return {
      items: result[0],
      total: result[1],
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async users(query: PageDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.status ? { isActive: query.status === 'active' } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: publicUserSelect,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async user(id: string) {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!row) throw new NotFoundException('User not found.');
    return row;
  }

  async userRecords(userId: string, resource: string, query: PageDto) {
    await this.user(userId);
    const paging = pageArgs(query);
    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    if (resource === 'memberships') {
      const where = { userId };
      const [items, total] = await Promise.all([
        this.prisma.businessUser.findMany({
          where,
          ...paging,
          orderBy,
          select: {
            id: true,
            role: true,
            isActive: true,
            business: { select: { id: true, name: true, isActive: true } },
          },
        }),
        this.prisma.businessUser.count({ where }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    }
    if (resource !== 'sessions')
      throw new NotFoundException('User resource not found.');
    const where = { userId, revokedAt: null, expiresAt: { gt: new Date() } };
    const [items, total] = await Promise.all([
      this.prisma.refreshToken.findMany({
        where,
        ...paging,
        orderBy,
        select: { id: true, createdAt: true, expiresAt: true },
      }),
      this.prisma.refreshToken.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async auditLogs(query: AuditQueryDto) {
    const where: Prisma.PlatformAuditLogWhereInput = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(query.action ? { action: query.action } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.platformAuditLog.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.platformAuditLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async manage(
    actorId: string,
    targetType: 'business' | 'user',
    targetId: string,
    input: ReasonDto & Partial<StatusDto>,
    revoke = false,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize administrator management, including last-admin checks. Shared with bootstrap CLI.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(80241024)`;
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { isActive: true, isPlatformAdmin: true },
      });
      if (!actor?.isActive || !actor.isPlatformAdmin)
        throw new ForbiddenException('Platform administrator access required.');
      if (targetType === 'user')
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${targetId} FOR UPDATE`;
      const previous =
        targetType === 'business'
          ? await tx.business.findUnique({
              where: { id: targetId },
              select: { isActive: true },
            })
          : await tx.user.findUnique({
              where: { id: targetId },
              select: { isActive: true, isPlatformAdmin: true },
            });
      if (!previous) throw new NotFoundException('Target not found.');
      if (
        targetType === 'user' &&
        !revoke &&
        input.isActive === false &&
        'isPlatformAdmin' in previous &&
        previous.isPlatformAdmin
      ) {
        const count = await tx.user.count({
          where: { isPlatformAdmin: true, isActive: true },
        });
        if (previous.isActive && count <= 1)
          throw new ForbiddenException(
            'The last active platform administrator cannot be disabled.',
          );
      }
      if (targetType === 'business') {
        await tx.business.update({
          where: { id: targetId },
          data: { isActive: input.isActive },
        });
      } else {
        await tx.user.update({
          where: { id: targetId },
          data: {
            ...(!revoke ? { isActive: input.isActive } : {}),
            ...(revoke || input.isActive === false
              ? { sessionVersion: { increment: 1 } }
              : {}),
          },
        });
        if (revoke || input.isActive === false)
          await tx.refreshToken.updateMany({
            where: { userId: targetId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
      }
      const action = revoke
        ? 'REVOKE_SESSIONS'
        : input.isActive
          ? 'REACTIVATE'
          : 'SUSPEND';
      await tx.platformAuditLog.create({
        data: {
          actorId,
          action,
          targetType,
          targetId,
          businessId: targetType === 'business' ? targetId : null,
          reason: input.reason,
          previous,
          next: revoke
            ? { sessionsRevoked: true }
            : { isActive: input.isActive! },
        },
      });
      return { changed: true };
    });
  }
}
