import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service.js';

const productInput = {
  name: 'Rice',
  sku: 'RICE-001',
  barcode: '8901234567890',
  unit: 'KG' as const,
  purchasePrice: '45.00',
  sellingPrice: '55.00',
  minimumStock: '10.000',
};

describe('ProductsService', () => {
  it('creates a product under an authorized business', async () => {
    const product = { id: 'product-a', businessId: 'business-a', ...productInput };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER' }) },
      product: { create: vi.fn().mockResolvedValue(product) },
    };

    const result = await new ProductsService(prisma as never, {} as never).create('user-a', 'business-a', productInput);

    expect(result).toEqual(product);
    expect(prisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessId: 'business-a', sku: 'RICE-001' }),
    }));
  });

  it('prevents a member of one business from reading another business product', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: false, role: 'MEMBER' }) },
      product: { findFirst: vi.fn() },
    };

    await expect(new ProductsService(prisma as never, {} as never).get('user-a', 'business-b', 'product-b'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it('keeps deactivated products retrievable for historical catalog context', async () => {
    const product = { id: 'product-a', businessId: 'business-a', status: 'INACTIVE' };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      product: { findFirst: vi.fn().mockResolvedValue(product) },
    };

    await expect(new ProductsService(prisma as never, {} as never).get('user-a', 'business-a', 'product-a')).resolves.toEqual(product);
  });

  it('returns not found when a product does not belong to the business', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      product: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(new ProductsService(prisma as never, {} as never).get('user-a', 'business-a', 'product-b'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
