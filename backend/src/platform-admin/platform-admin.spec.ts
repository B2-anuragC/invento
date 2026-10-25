import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { requireBusinessMembership } from '../auth/business-access.js';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { PageDto, StatusDto } from './platform-admin.dto.js';
import {
  metricPeriod,
  pageArgs,
  PlatformAdminService,
} from './platform-admin.service.js';

const context = (request: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as never;
describe('Platform access policy', () => {
  it('rejects unauthenticated requests before querying the database', async () => {
    const guard = new AccessTokenGuard(
      new ConfigService(),
      {} as never,
      {} as never,
    );
    await expect(
      guard.canActivate(context({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it.each([
    { isActive: true, isPlatformAdmin: false },
    { isActive: false, isPlatformAdmin: true },
    null,
  ])(
    'rejects business roles or inactive platform accounts: %j',
    async (account) => {
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue(account) },
      };
      await expect(
        new PlatformAdminGuard(prisma as never).canActivate(
          context({ user: { id: 'u' } }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it.each([
    { isActive: false, sessionVersion: 0 },
    { isActive: true, sessionVersion: 1 },
  ])('rejects disabled accounts and revoked access tokens', async (account) => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(account),
        updateMany: vi.fn(),
      },
    };
    const auth = { verifyAccessToken: () => ({ id: 'u', sessionVersion: 0 }) };
    const guard = new AccessTokenGuard(
      new ConfigService({ JWT_ACCESS_SECRET: 'test' }),
      auth as never,
      prisma as never,
    );
    await expect(
      guard.canActivate(
        context({ headers: { authorization: 'Bearer token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it('throttles activity updates using an atomic database condition', async () => {
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ isActive: true, sessionVersion: 0 }),
        updateMany: vi.fn(),
      },
    };
    const auth = { verifyAccessToken: () => ({ id: 'u', sessionVersion: 0 }) };
    await new AccessTokenGuard(
      new ConfigService({ JWT_ACCESS_SECRET: 'test' }),
      auth as never,
      prisma as never,
    ).canActivate(context({ headers: { authorization: 'Bearer token' } }));
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'u',
          OR: [
            { lastActivityAt: null },
            { lastActivityAt: { lt: expect.any(Date) } },
          ],
        },
      }),
    );
  });
  it.each([
    null,
    { isActive: false },
    { isActive: true, business: { isActive: false } },
  ])(
    'rejects missing memberships and suspended businesses',
    async (membership) => {
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
        businessUser: { findUnique: vi.fn().mockResolvedValue(membership) },
      };
      await expect(
        requireBusinessMembership(prisma as never, 'u', 'b'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});
describe('Platform validation and calculations', () => {
  it('bounds pagination and rejects boolean strings and missing confirmation', async () => {
    expect(
      await validate(plainToInstance(PageDto, { pageSize: 101, page: 0 })),
    ).toHaveLength(2);
    const invalid = plainToInstance(
      StatusDto,
      { isActive: 'false', reason: '  valid reason  ', confirmed: false },
      { enableImplicitConversion: true },
    );
    expect(
      (await validate(invalid)).map((error) => error.property).sort(),
    ).toEqual(['confirmed', 'isActive']);
    expect(invalid.reason).toBe('valid reason');
    expect(pageArgs({ page: 3, pageSize: 25 })).toEqual({ skip: 50, take: 25 });
  });
  it('uses a rolling 30-day default and rejects backwards or excessive ranges', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    expect(metricPeriod({}, now).from.toISOString()).toBe(
      '2026-09-24T12:00:00.000Z',
    );
    expect(() => metricPeriod({ from: '2026-10-25' }, now)).toThrow();
    expect(() => metricPeriod({ from: '2024-01-01' }, now)).toThrow();
  });
  it('uses aggregate counts, completed transactions and an exclusive end', async () => {
    const prisma = {
      business: {
        count: vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(7),
      },
      user: { count: vi.fn().mockResolvedValue(5) },
      product: { count: vi.fn().mockResolvedValue(9) },
      sale: { count: vi.fn().mockResolvedValue(2) },
      purchase: { count: vi.fn().mockResolvedValue(3) },
    };
    const result = await new PlatformAdminService(prisma as never).overview({
      from: '2026-10-01',
      to: '2026-10-24',
    });
    expect(result).toMatchObject({
      businesses: 10,
      suspendedBusinesses: 3,
      products: 9,
      sales: 2,
      purchases: 3,
    });
    expect(prisma.sale.count).toHaveBeenCalledWith({
      where: {
        status: 'COMPLETED',
        saleDate: { gte: new Date('2026-10-01'), lt: new Date('2026-10-24') },
      },
    });
  });
  it('rejects disabling the last active administrator without making changes', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      businessUser: { findMany: vi.fn().mockResolvedValue([]) },
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ isActive: true, isPlatformAdmin: true }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn(),
      },
      platformAuditLog: { create: vi.fn() },
    };
    const prisma = {
      $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
    };
    await expect(
      new PlatformAdminService(prisma as never).manage('u', 'user', 'u', {
        isActive: false,
        reason: 'test restriction',
        confirmed: true,
      }),
    ).rejects.toThrow('last active');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.platformAuditLog.create).not.toHaveBeenCalled();
  });
});
