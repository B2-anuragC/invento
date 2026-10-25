import { ForbiddenException } from '@nestjs/common';
import { requireBusinessMembership, supportAccess } from './business-access.js';
import { AuthController } from './auth.controller.js';
import type { Request } from 'express';

function database(
  membership: unknown,
  account = { isActive: true, isPlatformAdmin: false },
  activeShop = true,
) {
  return {
    businessUser: {
      findUnique: vi.fn().mockResolvedValue(membership),
      findMany: vi
        .fn()
        .mockResolvedValue([
          { business: { id: 'owned-shop', name: 'My shop' } },
        ]),
    },
    user: { findUnique: vi.fn().mockResolvedValue(account) },
    business: {
      findUnique: vi.fn().mockResolvedValue({ isActive: activeShop }),
    },
  };
}

describe('Shop panel access boundaries', () => {
  it('keeps an owner scoped to the requested membership', async () => {
    const db = database({
      businessId: 'mine',
      userId: 'owner',
      isActive: true,
      role: 'OWNER',
      business: { isActive: true },
    });
    expect(
      await requireBusinessMembership(db as never, 'owner', 'mine'),
    ).toMatchObject({ role: 'OWNER' });
    db.businessUser.findUnique.mockResolvedValue(null);
    await expect(
      requireBusinessMembership(db as never, 'owner', 'someone-else'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.businessUser.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          businessId_userId: { businessId: 'someone-else', userId: 'owner' },
        },
      }),
    );
  });
  it('lets a current platform administrator operate an active shop without membership', async () => {
    const db = database(null, { isActive: true, isPlatformAdmin: true });
    expect(
      await supportAccess.run({ userId: 'operator', businessId: 'any-shop' }, () => requireBusinessMembership(db as never, 'operator', 'any-shop')),
    ).toMatchObject({
      role: 'PLATFORM_SUPPORT',
      userId: 'operator',
      businessId: 'any-shop',
    });
  });
  it('uses platform privileges even when the operator has a lower shop role', async () => {
    const db = database({
      isActive: true,
      role: 'MEMBER',
      business: { isActive: true },
      user: { isPlatformAdmin: true },
    });
    expect(
      await requireBusinessMembership(db as never, 'operator', 'shop'),
    ).toMatchObject({ role: 'MEMBER' });
  });
  it.each([
    [{ isActive: true, isPlatformAdmin: false }, true],
    [{ isActive: false, isPlatformAdmin: true }, true],
    [{ isActive: true, isPlatformAdmin: true }, false],
  ])(
    'rejects outsiders, disabled operators, and suspended shops (%j, %s)',
    async (account, activeShop) => {
      const db = database(null, account, activeShop);
      await expect(
        requireBusinessMembership(db as never, 'user', 'shop'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it('does not invent a membership for the target of a team role change', async () => {
    const db = database(null, { isActive: true, isPlatformAdmin: true });
    await expect(
      requireBusinessMembership(db as never, 'operator', 'shop', false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it('discovers only active owned shops and returns platform access independently', async () => {
    const db = database(null);
    const controller = new AuthController({} as never, db as never);
    const result = await controller.panelAccess({
      user: { id: 'owner' },
    } as Request);
    expect(result).toEqual({
      isPlatformAdmin: false,
      shops: [{ id: 'owned-shop', name: 'My shop' }],
    });
    expect(db.businessUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'owner',
          isActive: true,
          business: { isActive: true },
        },
      }),
    );
  });
});
