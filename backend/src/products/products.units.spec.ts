import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductsService } from './products.service.js';

const input = { name: 'Eggs', sku: 'EGGS', unit: 'DOZEN', purchasePrice: '100', sellingPrice: '120', minimumStock: '1' };
function environment() {
  const prisma = {
    businessUser: { findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', isActive: true, business: { isActive: true } }) },
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
  it('allows dozens and custom box sizes for a piece-stocked product', async () => {
    const { service } = environment();
    const saved = await service.create('user', 'business', { ...input, unit: 'PIECE', sellingOptions: [
      { id: 'dozen', name: 'Dozen', unit: 'DOZEN', quantity: '1', sellingPrice: '100' },
      { id: 'box', name: 'Small box', unit: 'BOX', piecesPerUnit: 6, quantity: '1', sellingPrice: '55' },
    ] });
    expect((saved.sellingOptions as { piecesPerUnit?: number }[])[1]).toMatchObject({ piecesPerUnit: 6 });
  });
  it('allows gram options and independently labelled units', async () => {
    const { service } = environment();
    await expect(service.create('user', 'business', { ...input, unit: 'KG', sellingOptions: [{ id: 'half', name: 'Half kg', unit: 'GRAM', quantity: '500', sellingPrice: '30' }] })).resolves.toBeDefined();
    await expect(service.create('user', 'business', { ...input, unit: 'KG', sellingOptions: [{ id: 'wrong', name: 'Piece', unit: 'PIECE', quantity: '1', sellingPrice: '30' }] })).resolves.toBeDefined();
  });
  it('accepts feet and square feet options without sheet dimension calculations', async () => {
    const { service } = environment();
    const saved = await service.create('user', 'business', { ...input, unit: 'PIECE', sellingOptions: [
      { id: 'feet', name: 'Length', unit: 'FOOT', quantity: '2.5', sellingPrice: '30' },
      { id: 'area', name: '8 x 4 sheet', unit: 'SQUARE_FOOT', quantity: '32', sellingPrice: '100' },
    ] });
    expect(saved.sellingOptions).toHaveLength(2);
  });
  it('rejects undefined box sizes and fractional pieces', async () => {
    const { service } = environment();
    await expect(service.create('user', 'business', { ...input, unit: 'PIECE', sellingOptions: [{ id: 'box', name: 'Box', unit: 'BOX', quantity: '1', sellingPrice: '30' }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('user', 'business', { ...input, sellingOptions: [{ id: 'part', name: 'Part dozen', unit: 'DOZEN', quantity: '0.8', sellingPrice: '30' }] })).rejects.toBeInstanceOf(BadRequestException);
  });
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
