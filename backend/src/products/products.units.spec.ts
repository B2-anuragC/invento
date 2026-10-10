import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductsService } from './products.service.js';

const input = { name: 'Eggs', sku: 'EGGS', unit: 'DOZEN', purchasePrice: '100', sellingPrice: '120', minimumStock: '1' };
function environment() {
  const prisma = {
    businessUser: { findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', isActive: true }) },
    product: {
      create: vi.fn(async ({ data }) => data),
      findFirst: vi.fn().mockResolvedValue({ id: 'product-a', unit: 'BOX', piecesPerUnit: 24 }),
      update: vi.fn(async ({ data }) => data),
    },
    inventory: { findUnique: vi.fn().mockResolvedValue({ quantity: '24' }) },
    inventoryTransaction: { count: vi.fn().mockResolvedValue(1) },
  };
  return { prisma, service: new ProductsService(prisma as never, {} as never) };
}

describe('Product retail group sizes', () => {
  it('automatically configures a dozen as twelve pieces', async () => {
    const { service } = environment();
    expect(await service.create('user', 'business', input)).toMatchObject({ piecesPerUnit: 12 });
  });
  it.each([0, 1.5, 100001])('rejects invalid box size %s', async (piecesPerUnit) => {
    const { service } = environment();
    await expect(service.create('user', 'business', { ...input, unit: 'BOX', piecesPerUnit })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects conversion sizes for weight products and a nonstandard dozen', async () => {
    const { service } = environment();
    await expect(service.create('user', 'business', { ...input, unit: 'KG', piecesPerUnit: 24 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('user', 'business', { ...input, piecesPerUnit: 24 })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('prevents changing a package size once stock has been recorded', async () => {
    const { service, prisma } = environment();
    await expect(service.update('user', 'business', 'product-a', { piecesPerUnit: 12 })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
  it('allows editing the price without changing the established package size', async () => {
    const { service } = environment();
    expect(await service.update('user', 'business', 'product-a', { sellingPrice: '140' })).toMatchObject({ piecesPerUnit: 24, sellingPrice: '140' });
  });
});


describe('Multiple product quantity prices', () => {
  it('saves all quantity and price options together when editing a product', async () => {
    const { service, prisma } = environment();
    const sellingOptions = [
      { id: 'single', name: 'Single piece', unit: 'PIECE', quantity: '1', sellingPrice: '10' },
      { id: 'six', name: 'Six pieces', unit: 'PIECE', quantity: '6', sellingPrice: '55' },
      { id: 'box', name: 'Box', unit: 'BOX', quantity: '1', sellingPrice: '200' },
    ];
    const saved = await service.update('user', 'business', 'product-a', { sellingOptions });
    expect(saved.sellingOptions).toEqual(sellingOptions.map((option) => ({ ...option, sellingPrice: Number(option.sellingPrice).toFixed(2) })));
    expect(prisma.product.update).toHaveBeenCalledOnce();
    expect(saved.sellingOptions).toHaveLength(3);
  });
});
