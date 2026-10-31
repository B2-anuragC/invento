import { DEFAULT_ROLE_PERMISSIONS } from '@invento/shared';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: false }) },
    } as never;
    const service = new BusinessesService(prisma);
    await expect(service.get('user-a', 'business-b')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects members without manager role from updating a business', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
      businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'MEMBER', roleDefinition: { permissions: [...DEFAULT_ROLE_PERMISSIONS.MEMBER] } }) },
    } as never;
    const service = new BusinessesService(prisma);
    await expect(service.update('user-a', 'business-a', { name: 'new' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only allows managers to update pricing access', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
      businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'MEMBER', roleDefinition: { permissions: [...DEFAULT_ROLE_PERMISSIONS.MEMBER] } }) },
      business: { update: vi.fn() },
    } as never;
    (prisma as any).$transaction = async (fn: any) => fn({ ...(prisma as any), $queryRaw: vi.fn() });
    const service = new BusinessesService(prisma);
    await expect(service.updatePricingAccess('user-a', 'business-a', false)).rejects.toBeInstanceOf(ForbiddenException);
    expect((prisma as { business: { update: ReturnType<typeof vi.fn> } }).business.update).not.toHaveBeenCalled();
  });

  it('returns pricing access only for active business members', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
      businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'OWNER', roleDefinition: { permissions: [...DEFAULT_ROLE_PERMISSIONS.OWNER] } }) },
      business: { findUnique: vi.fn().mockResolvedValue({ membersCanViewPurchasePrice: false }) },
    } as never;
    const service = new BusinessesService(prisma);
    await expect(service.getPricingAccess('user-a', 'business-a')).resolves.toEqual({
      membersCanViewPurchasePrice: false,
      role: 'OWNER',
      permissions: [...DEFAULT_ROLE_PERMISSIONS.OWNER],
    });
  });
  describe('invoice prefixes', () => {
    const owner = () => {
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
        businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'OWNER', roleDefinition: { permissions: [...DEFAULT_ROLE_PERMISSIONS.OWNER] } }) },
        business: { update: vi.fn(async ({ data }: { data: object }) => data) },
      };
      return { prisma, service: new BusinessesService(prisma as never) };
    };

    it('normalises prefixes to uppercase before saving', async () => {
      const { service, prisma } = owner();
      await service.update('user-a', 'business-a', { invoicePrefix: ' gs ', purchasePrefix: 'p1' });
      expect(prisma.business.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ invoicePrefix: 'GS', purchasePrefix: 'P1' }) }));
    });

    it('rejects prefixes that would break the 16-character invoice number', async () => {
      const { service, prisma } = owner();
      for (const invoicePrefix of ['', 'INVO', 'I/V', 'I-V']) {
        await expect(service.update('user-a', 'business-a', { invoicePrefix })).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(prisma.business.update).not.toHaveBeenCalled();
    });

    it('leaves prefixes unchanged when they are not sent', async () => {
      const { service, prisma } = owner();
      await service.update('user-a', 'business-a', { name: 'Shop' });
      expect(prisma.business.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ invoicePrefix: undefined, purchasePrefix: undefined }) }));
    });
  });
});
