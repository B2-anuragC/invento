import { DEFAULT_ROLE_PERMISSIONS, SHOP_ID_RULE_MESSAGE, SHOP_ID_TAKEN_MESSAGE, WALK_IN_CUSTOMER_NAME } from '@invento/shared';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  describe('GST profile', () => {
    const owner = () => {
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
        businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'OWNER', roleDefinition: { permissions: [...DEFAULT_ROLE_PERMISSIONS.OWNER] } }) },
        business: { update: vi.fn(async ({ data }: { data: object }) => data), findUnique: vi.fn().mockResolvedValue({ gstin: null }) },
      };
      return { prisma, service: new BusinessesService(prisma as never) };
    };

    it('rejects a state sent alone that contradicts the GSTIN on file', async () => {
      const { service, prisma } = owner();
      prisma.business.findUnique.mockResolvedValue({ gstin: '27AAPFU0939F1ZV' });
      await expect(service.update('user-a', 'business-a', { stateCode: '29' })).rejects.toThrow('Maharashtra (27)');
      await service.update('user-a', 'business-a', { stateCode: '27' });
      expect(prisma.business.update).toHaveBeenCalledTimes(1);
    });

    it('stores the GSTIN normalised and takes the state from it', async () => {
      const { service, prisma } = owner();
      await service.update('user-a', 'business-a', { gstin: '27aapfu0939f1zv' });
      expect(prisma.business.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ gstin: '27AAPFU0939F1ZV', stateCode: '27' }) }));
    });

    it('rejects a state that contradicts the GSTIN', async () => {
      const { service, prisma } = owner();
      await expect(service.update('user-a', 'business-a', { gstin: '27AAPFU0939F1ZV', stateCode: '29' })).rejects.toThrow('Maharashtra (27)');
      expect(prisma.business.update).not.toHaveBeenCalled();
    });

    it('lets an unregistered shop set only a state, and clearing the GSTIN keeps the state', async () => {
      const { service, prisma } = owner();
      await service.update('user-a', 'business-a', { stateCode: '29' });
      expect(prisma.business.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ gstin: undefined, stateCode: '29' }) }));
      await service.update('user-a', 'business-a', { gstin: '' });
      expect(prisma.business.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ gstin: null, stateCode: undefined }) }));
    });

    it('clears blank optional details instead of storing empty strings', async () => {
      const { service, prisma } = owner();
      await service.update('user-a', 'business-a', { email: '', phone: ' ', address: '', stateCode: '' });
      expect(prisma.business.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: null, phone: null, address: null, stateCode: null }) }));
    });
  });

  describe('create', () => {
    // A transaction stub that only commits the rows when the callback succeeds.
    const creating = (overrides: { isActive?: boolean; businessCreate?: ReturnType<typeof vi.fn>; membershipCreate?: ReturnType<typeof vi.fn> } = {}) => {
      const committed: string[] = [];
      const tx = {
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
        user: { findUnique: vi.fn().mockResolvedValue({ isActive: overrides.isActive ?? true }) },
        business: { create: overrides.businessCreate ?? vi.fn(async ({ data }) => ({ id: 'business-1', ...data })) },
        businessRole: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
        customer: { create: vi.fn().mockResolvedValue({}) },
        businessUser: { create: overrides.membershipCreate ?? vi.fn().mockResolvedValue({}) },
        platformAuditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = { $transaction: vi.fn(async (callback) => { const result = await callback(tx); committed.push('business-1'); return result; }) };
      return { tx, committed, service: new BusinessesService(prisma as never) };
    };
    const uniqueViolation = (target: string[]) => new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0', meta: { target } });

    it('creates the shop with its owner, default roles, walk-in customer and audit entry', async () => {
      const { tx, service } = creating();
      await service.create('user-a', { name: ' Shree Aluminium ', slug: 'shree-aluminium' });
      expect(tx.business.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Shree Aluminium', slug: 'shree-aluminium' }) });
      expect(tx.businessRole.createMany.mock.calls[0][0].data.map((role: { key: string }) => role.key).sort()).toEqual(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort());
      expect(tx.customer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ businessId: 'business-1', name: WALK_IN_CUSTOMER_NAME, isWalkIn: true }) });
      expect(tx.businessUser.create).toHaveBeenCalledWith({ data: { businessId: 'business-1', userId: 'user-a', role: 'OWNER' } });
      expect(tx.platformAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'BUSINESS_OWNER_CREATED', businessId: 'business-1' }) });
    });

    it('normalizes the shop ID instead of rejecting older formats', async () => {
      const { tx, service } = creating();
      await service.create('user-a', { name: 'My Shop', slug: 'My Shop!' });
      expect(tx.business.create).toHaveBeenCalledWith({ data: expect.objectContaining({ slug: 'my-shop' }) });
    });

    it.each(['--', '!!'])('rejects a shop ID with fewer than two letters or numbers (%s)', async (slug) => {
      const { tx, service } = creating();
      const create = service.create('user-a', { name: 'My Shop', slug });
      await expect(create).rejects.toBeInstanceOf(BadRequestException);
      await expect(create).rejects.toThrow(SHOP_ID_RULE_MESSAGE);
      expect(tx.business.create).not.toHaveBeenCalled();
    });

    it('reports a taken shop ID in plain words', async () => {
      const { service } = creating({ businessCreate: vi.fn().mockRejectedValue(uniqueViolation(['slug'])) });
      const create = service.create('user-a', { name: 'Shop', slug: 'shop' });
      await expect(create).rejects.toBeInstanceOf(ConflictException);
      await expect(create).rejects.toThrow(SHOP_ID_TAKEN_MESSAGE);
    });

    it('passes other unique violations through unchanged', async () => {
      const violation = uniqueViolation(['id']);
      const { service } = creating({ businessCreate: vi.fn().mockRejectedValue(violation) });
      await expect(service.create('user-a', { name: 'Shop', slug: 'shop' })).rejects.toBe(violation);
    });

    it('refuses an inactive account and creates nothing', async () => {
      const { tx, service } = creating({ isActive: false });
      await expect(service.create('user-a', { name: 'Shop', slug: 'shop' })).rejects.toThrow(new ForbiddenException('Account is inactive.'));
      expect(tx.business.create).not.toHaveBeenCalled();
    });

    it('commits nothing when adding the owner fails', async () => {
      const failure = new Error('membership write failed');
      const { committed, service } = creating({ membershipCreate: vi.fn().mockRejectedValue(failure) });
      await expect(service.create('user-a', { name: 'Shop', slug: 'shop' })).rejects.toBe(failure);
      expect(committed).toEqual([]);
    });
  });
});
