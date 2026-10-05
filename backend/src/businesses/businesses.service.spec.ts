import { ForbiddenException } from '@nestjs/common';
import { BusinessesService } from './businesses.service.js';

describe('BusinessesService authorization', () => {
  it('lists only active business memberships for the requested user', async () => {
    const memberships = [{ role: 'OWNER', business: { id: 'business-a', name: 'Shop A', slug: 'shop-a' } }];
    const prisma = {
      businessUser: { findMany: vi.fn().mockResolvedValue(memberships) },
    } as never;
    const service = new BusinessesService(prisma);

    await expect(service.listForUser('user-a')).resolves.toEqual(memberships);
    expect((prisma as { businessUser: { findMany: ReturnType<typeof vi.fn> } }).businessUser.findMany)
      .toHaveBeenCalledWith({
        where: { userId: 'user-a', isActive: true, business: { isActive: true } },
        select: { role: true, business: { select: { id: true, name: true, slug: true } } },
        orderBy: { business: { name: 'asc' } },
      });
  });

  it('rejects users who are not active members', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: false }) },
    } as never;
    const service = new BusinessesService(prisma);
    await expect(service.get('user-a', 'business-b')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects members without manager role from updating a business', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
    } as never;
    const service = new BusinessesService(prisma);
    await expect(service.update('user-a', 'business-a', { name: 'new' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only allows managers to update pricing access', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      business: { update: vi.fn() },
    } as never;
    const service = new BusinessesService(prisma);
    await expect(service.updatePricingAccess('user-a', 'business-a', false)).rejects.toBeInstanceOf(ForbiddenException);
    expect((prisma as { business: { update: ReturnType<typeof vi.fn> } }).business.update).not.toHaveBeenCalled();
  });

  it('returns pricing access only for active business members', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER' }) },
      business: { findUnique: vi.fn().mockResolvedValue({ membersCanViewPurchasePrice: false }) },
    } as never;
    const service = new BusinessesService(prisma);
    await expect(service.getPricingAccess('user-a', 'business-a')).resolves.toEqual({
      membersCanViewPurchasePrice: false,
      role: 'OWNER',
    });
  });
});
