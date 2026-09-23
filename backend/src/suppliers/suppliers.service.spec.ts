import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';

const supplierInput = {
  name: 'Acme Distributors',
  contactName: 'Jane Doe',
  phone: '9999999999',
  email: 'jane@acme.test',
  address: '123 Market St',
};

describe('SuppliersService', () => {
  it('creates a supplier under an authorized business', async () => {
    const supplier = { id: 'supplier-a', businessId: 'business-a', ...supplierInput };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER' }) },
      supplier: { create: vi.fn().mockResolvedValue(supplier) },
    };

    const result = await new SuppliersService(prisma as never).create('user-a', 'business-a', supplierInput);

    expect(result).toEqual(supplier);
    expect(prisma.supplier.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessId: 'business-a', name: 'Acme Distributors' }),
    }));
  });

  it('lists active suppliers for the business by default', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      supplier: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await new SuppliersService(prisma as never).list('user-a', 'business-a', {});

    expect(prisma.supplier.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessId: 'business-a', status: 'ACTIVE' }),
    }));
  });

  it('gets a supplier that belongs to the business', async () => {
    const supplier = { id: 'supplier-a', businessId: 'business-a', ...supplierInput };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      supplier: { findFirst: vi.fn().mockResolvedValue(supplier) },
    };

    await expect(new SuppliersService(prisma as never).get('user-a', 'business-a', 'supplier-a')).resolves.toEqual(supplier);
  });

  it('updates a supplier that belongs to the business', async () => {
    const existing = { id: 'supplier-a', businessId: 'business-a', ...supplierInput };
    const updated = { ...existing, name: 'Acme Renamed' };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER' }) },
      supplier: { findFirst: vi.fn().mockResolvedValue(existing), update: vi.fn().mockResolvedValue(updated) },
    };

    const result = await new SuppliersService(prisma as never).update('user-a', 'business-a', 'supplier-a', { name: 'Acme Renamed' });

    expect(result).toEqual(updated);
  });

  it('rejects a member without manager permissions from updating a supplier', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      supplier: { findFirst: vi.fn(), update: vi.fn() },
    };

    await expect(new SuppliersService(prisma as never).update('user-a', 'business-a', 'supplier-a', { name: 'x' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.supplier.findFirst).not.toHaveBeenCalled();
  });

  it('prevents a user from reading a supplier belonging to another business (tenant isolation)', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      supplier: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(new SuppliersService(prisma as never).get('user-a', 'business-a', 'supplier-b'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('deactivates a supplier instead of deleting it, preserving historical purchase data', async () => {
    const existing = { id: 'supplier-a', businessId: 'business-a', status: 'ACTIVE' };
    const deactivated = { ...existing, status: 'INACTIVE' };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER' }) },
      supplier: { findFirst: vi.fn().mockResolvedValue(existing), update: vi.fn().mockResolvedValue(deactivated) },
    };

    const result = await new SuppliersService(prisma as never).deactivate('user-a', 'business-a', 'supplier-a');

    expect(result.status).toBe('INACTIVE');
    expect(prisma.supplier.update).toHaveBeenCalledWith({ where: { id: 'supplier-a' }, data: { status: 'INACTIVE' } });
  });
});
