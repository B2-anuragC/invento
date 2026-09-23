import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service.js';

const customerInput = {
  name: 'Acme Distributors',
  contactName: 'Jane Doe',
  phone: '9999999999',
  email: 'jane@acme.test',
  address: '123 Market St',
};

describe('CustomersService', () => {
  it.each([null, { isActive: false, role: 'OWNER' }])('rejects missing or inactive membership', async (membership) => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue(membership) },
      customer: { findMany: vi.fn() },
    };
    await expect(new CustomersService(prisma as never).list('user-a', 'business-a', {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it('scopes updates and deactivation to the requested business', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER' }) },
      customer: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    };
    const service = new CustomersService(prisma as never);
    await expect(service.update('user-a', 'business-a', 'customer-b', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deactivate('user-a', 'business-a', 'customer-b')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customer.findFirst).toHaveBeenCalledWith({ where: { id: 'customer-b', businessId: 'business-a' } });
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('allows admins to reactivate customers and members to search inactive history', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'ADMIN' }) },
      customer: { findFirst: vi.fn().mockResolvedValue({ id: 'customer-a' }), update: vi.fn(), findMany: vi.fn() },
    };
    const service = new CustomersService(prisma as never);
    await service.update('user-a', 'business-a', 'customer-a', { status: 'ACTIVE' });
    expect(prisma.customer.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }));
    prisma.businessUser.findUnique.mockResolvedValue({ isActive: true, role: 'MEMBER' });
    await service.list('user-a', 'business-a', { search: ' Jane ', status: 'INACTIVE' });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: 'business-a', status: 'INACTIVE', OR: expect.arrayContaining([{ name: { contains: 'Jane', mode: 'insensitive' } }]) }) }));
  });
  it('creates a customer under an authorized business', async () => {
    const customer = { id: 'customer-a', businessId: 'business-a', ...customerInput };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER' }) },
      customer: { create: vi.fn().mockResolvedValue(customer) },
    };

    const result = await new CustomersService(prisma as never).create('user-a', 'business-a', customerInput);

    expect(result).toEqual(customer);
    expect(prisma.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessId: 'business-a', name: 'Acme Distributors' }),
    }));
  });

  it('lists active customers for the business by default', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      customer: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await new CustomersService(prisma as never).list('user-a', 'business-a', {});

    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessId: 'business-a', status: 'ACTIVE' }),
    }));
  });

  it('gets a customer that belongs to the business', async () => {
    const customer = { id: 'customer-a', businessId: 'business-a', ...customerInput };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      customer: { findFirst: vi.fn().mockResolvedValue(customer) },
    };

    await expect(new CustomersService(prisma as never).get('user-a', 'business-a', 'customer-a')).resolves.toEqual(customer);
  });

  it('updates a customer that belongs to the business', async () => {
    const existing = { id: 'customer-a', businessId: 'business-a', ...customerInput };
    const updated = { ...existing, name: 'Acme Renamed' };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER' }) },
      customer: { findFirst: vi.fn().mockResolvedValue(existing), update: vi.fn().mockResolvedValue(updated) },
    };

    const result = await new CustomersService(prisma as never).update('user-a', 'business-a', 'customer-a', { name: 'Acme Renamed' });

    expect(result).toEqual(updated);
  });

  it('rejects a member without manager permissions from updating a customer', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      customer: { findFirst: vi.fn(), update: vi.fn() },
    };

    await expect(new CustomersService(prisma as never).update('user-a', 'business-a', 'customer-a', { name: 'x' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
  });

  it('prevents a user from reading a customer belonging to another business (tenant isolation)', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      customer: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(new CustomersService(prisma as never).get('user-a', 'business-a', 'customer-b'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('deactivates a customer instead of deleting it, preserving historical sale data', async () => {
    const existing = { id: 'customer-a', businessId: 'business-a', status: 'ACTIVE' };
    const deactivated = { ...existing, status: 'INACTIVE' };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER' }) },
      customer: { findFirst: vi.fn().mockResolvedValue(existing), update: vi.fn().mockResolvedValue(deactivated) },
    };

    const result = await new CustomersService(prisma as never).deactivate('user-a', 'business-a', 'customer-a');

    expect(result.status).toBe('INACTIVE');
    expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: 'customer-a' }, data: { status: 'INACTIVE' } });
  });
});
