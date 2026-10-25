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
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
      businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'OWNER' }) },
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
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
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
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
      businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'MEMBER' }) },
      product: { findFirst: vi.fn().mockResolvedValue(product) },
      business: { findUnique: vi.fn().mockResolvedValue({ membersCanViewPurchasePrice: true }) },
    };

    await expect(new ProductsService(prisma as never, {} as never).get('user-a', 'business-a', 'product-a')).resolves.toEqual(product);
  });

  it('returns not found when a product does not belong to the business', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
      businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'MEMBER' }) },
      product: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(new ProductsService(prisma as never, {} as never).get('user-a', 'business-a', 'product-b'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('omits purchase price for members when the business setting hides it', async () => {
    const product = { id: 'product-a', businessId: 'business-a', purchasePrice: '45.00' };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
      businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'MEMBER' }) },
      product: { findFirst: vi.fn().mockResolvedValue(product) },
      business: { findUnique: vi.fn().mockResolvedValue({ membersCanViewPurchasePrice: false }) },
    };

    await expect(new ProductsService(prisma as never, {} as never).get('user-a', 'business-a', 'product-a'))
      .resolves.toEqual({ id: 'product-a', businessId: 'business-a' });
  });
  it('stores file references and excludes full-size references from product lists', async () => {
    const original = `/files/${'a'.repeat(64)}/original`;
    const thumbnail = `/files/${'a'.repeat(64)}/thumbnail`;
    const product = { id: 'product-a', businessId: 'business-a', ...productInput, imageThumbnail: thumbnail, imageOriginal: original };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER', business: { isActive: true } }) },
      product: { create: vi.fn().mockResolvedValue(product), findMany: vi.fn().mockResolvedValue([product]) },
    };
    const files = { image: vi.fn().mockResolvedValue({ url: original, thumbnailUrl: thumbnail }) };
    const service = new ProductsService(prisma as never, {} as never, files as never);
    await service.create('user-a', 'business-a', { ...productInput, imageThumbnail: thumbnail, imageOriginal: original });
    expect(prisma.product.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ imageThumbnail: thumbnail, imageOriginal: original }) }));
    const list = await service.list('user-a', 'business-a', {});
    expect(list[0]).not.toHaveProperty('imageOriginal');
    expect(list[0].imageThumbnail).toBe(thumbnail);
    await expect(service.create('user-a', 'business-a', { ...productInput, imageThumbnail: thumbnail, imageOriginal: null })).rejects.toThrow('uploaded product image');
  });

  it('removes both images on update and preserves them when omitted', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER', business: { isActive: true } }) },
      product: { findFirst: vi.fn().mockResolvedValue({ ...productInput, piecesPerUnit: null }), update: vi.fn().mockResolvedValue({}) },
    };
    const service = new ProductsService(prisma as never, {} as never);
    await service.update('user-a', 'business-a', 'product-a', { imageThumbnail: null, imageOriginal: null });
    expect(prisma.product.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ imageThumbnail: null, imageOriginal: null }) }));
    await service.update('user-a', 'business-a', 'product-a', { name: 'Updated rice' });
    expect(prisma.product.update.mock.calls.at(-1)?.[0].data).not.toHaveProperty('imageOriginal');
  });

  it('validates every gallery reference, derives thumbnails, and uses the first photo as cover', async () => {
    const originals = ['a', 'b'].map((char) => `/files/${char.repeat(64)}/original`);
    const files = { image: vi.fn().mockImplementation(async (_business, url) => ({ url, thumbnailUrl: url.replace('/original', '/thumbnail') })) };
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'OWNER', business: { isActive: true } }) },
      product: { create: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue({ ...productInput, piecesPerUnit: null }), update: vi.fn().mockResolvedValue({}) },
    };
    const service = new ProductsService(prisma as never, {} as never, files as never);
    await service.create('user-a', 'business-a', { ...productInput, images: originals.map((imageOriginal) => ({ imageOriginal })) });
    expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({ imageOriginal: originals[0], images: originals.map((imageOriginal) => ({ imageOriginal, imageThumbnail: imageOriginal.replace('/original', '/thumbnail') })) });
    expect(files.image).toHaveBeenCalledWith('business-a', originals[1], 'product');
    await service.update('user-a', 'business-a', 'product-a', { images: [{ imageOriginal: originals[1] }, { imageOriginal: originals[0] }] });
    expect(prisma.product.update.mock.calls.at(-1)?.[0].data.imageOriginal).toBe(originals[1]);
    await service.update('user-a', 'business-a', 'product-a', { images: [] });
    expect(prisma.product.update.mock.calls.at(-1)?.[0].data).toMatchObject({ images: [], imageOriginal: null, imageThumbnail: null });
    await expect(service.create('user-a', 'business-a', { ...productInput, images: Array(7).fill({ imageOriginal: originals[0] }) })).rejects.toThrow('six');
    await expect(service.create('user-a', 'business-a', { ...productInput, images: [{ imageOriginal: originals[0] }, { imageOriginal: originals[0] }] })).rejects.toThrow('unique');
    files.image.mockRejectedValue(new Error('File not found in this business.'));
    await expect(service.create('user-a', 'business-b', { ...productInput, images: [{ imageOriginal: originals[0] }] })).rejects.toThrow('this business');
  });

});
