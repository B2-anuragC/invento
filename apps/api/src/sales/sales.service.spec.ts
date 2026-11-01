import { DEFAULT_ROLE_PERMISSIONS } from '@invento/shared';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service.js';
import { SalesService } from './sales.service.js';

type InventoryRow = { id: string; businessId: string; productId: string; quantity: Prisma.Decimal };

function createFakeEnvironment(
  options: {
    role?: string;
    isActive?: boolean;
    customer?: { id: string; businessId: string; status: string; gstin?: string | null; isWalkIn?: boolean | null } | null;
    shop?: { gstin: string | null; stateCode: string | null };
    products?: { id: string; businessId: string; status: string; name: string; unit?: string; piecesPerUnit?: number; hsnCode?: string | null; gstRate?: string }[];
    openingStock?: Record<string, string>;
    failInventoryOnProductId?: string;
  } = {},
) {
  const role = options.role ?? 'OWNER';
  const isActive = options.isActive ?? true;
  const customer = options.customer === undefined ? { id: 'customer-a', businessId: 'business-a', status: 'ACTIVE', gstin: null } : options.customer;
  const products = options.products ?? [{ id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Rice', unit: 'KG', hsnCode: null }];
  const shop = options.shop ?? { gstin: null, stateCode: null };

  const store: {
    sales: Record<string, unknown>;
    saleItems: unknown[];
    inventory: Record<string, InventoryRow>;
    inventoryTransactions: unknown[];
    counters: Record<string, number>;
  } = { sales: {}, saleItems: [], inventory: {}, inventoryTransactions: [], counters: {} };

  for (const [productId, quantity] of Object.entries(options.openingStock ?? { 'product-a': '100.000' })) {
    store.inventory[productId] = { id: `inventory-${productId}`, businessId: 'business-a', productId, quantity: new Prisma.Decimal(quantity) };
  }

  function buildTxClient() {
    return {
      $queryRaw: vi.fn(async (query: { strings?: readonly string[]; values?: unknown[] }) => {
        // Invoice counter: INSERT ... ON CONFLICT DO UPDATE ... RETURNING "lastNumber".
        if (query?.strings?.join('').includes('document_counters')) {
          const key = (query.values ?? []).slice(0, 3).join('|');
          store.counters[key] = (store.counters[key] ?? 0) + 1;
          return [{ lastNumber: store.counters[key] }];
        }
        const productId = query?.values?.[0] as string | undefined;
        if (options.failInventoryOnProductId && options.failInventoryOnProductId === productId) throw new Error('Simulated inventory failure');
        const row = productId ? store.inventory[productId] : undefined;
        return row ? [{ id: row.id, quantity: row.quantity }] : [];
      }),
      inventory: {
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: { quantity: Prisma.Decimal } }) => {
          const row = Object.values(store.inventory).find((r) => r.id === where.id);
          if (row) row.quantity = data.quantity;
          return row;
        }),
      },
      inventoryTransaction: {
        create: vi.fn(async ({ data }: { data: unknown }) => {
          store.inventoryTransactions.push(data);
          return data;
        }),
      },
      business: { findUniqueOrThrow: vi.fn(async () => ({ invoicePrefix: 'INV', purchasePrefix: 'PUR' })) },
      sale: {
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          Object.assign(store.sales[where.id] as Record<string, unknown>, data);
          return store.sales[where.id];
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const sale = { id: 'sale-a', ...data };
          store.sales[sale.id] = sale;
          return sale;
        }),
        findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
          const sale = store.sales[where.id];
          if (!sale) throw new Error('not found');
          return { ...sale, items: store.saleItems, customer };
        }),
      },
      saleItem: {
        create: vi.fn(async ({ data }: { data: unknown }) => {
          store.saleItems.push(data);
          return data;
        }),
      },
      transactionPayment: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
    };
  }

  const txClient = buildTxClient();

  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
    businessUser: { findUnique: vi.fn(async () => (isActive ? { business: { isActive: true }, isActive, role, roleDefinition: { permissions: [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])] } } : { isActive: false, role })) },
    customer: { findFirst: vi.fn(async () => customer) },
    business: { findUniqueOrThrow: vi.fn(async () => shop) },
    product: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) => products.find((p) => p.id === where.id)), findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => products.filter((p) => where.id.in.includes(p.id))) },
    sale: { findFirst: vi.fn(async () => null) },
    // Simulates real Postgres transaction semantics: writes made during the
    // callback mutate the store. On failure, restore the pre-transaction
    // snapshot. This models rollback, not database locking or isolation.
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const snapshotBefore = JSON.parse(JSON.stringify({
        sales: store.sales,
        saleItems: store.saleItems,
        inventory: Object.fromEntries(Object.entries(store.inventory).map(([id, row]) => [id, { ...row, quantity: row.quantity.toString() }])),
        inventoryTransactions: store.inventoryTransactions,
        counters: store.counters,
      }));
      try {
        return await callback(txClient);
      } catch (error) {
        store.sales = snapshotBefore.sales;
        store.saleItems = snapshotBefore.saleItems;
        store.inventory = Object.fromEntries(
          Object.entries(snapshotBefore.inventory as Record<string, InventoryRow>).map(([id, row]) => [id, { ...row, quantity: new Prisma.Decimal(row.quantity) }]),
        );
        store.inventoryTransactions = snapshotBefore.inventoryTransactions;
        store.counters = snapshotBefore.counters;
        throw error;
      }
    }),
  };

  const inventory = new InventoryService(prisma as never);
  const service = new SalesService(prisma as never, inventory);

  return { prisma, store, service, txClient };
}

const saleInput = {
  customerId: 'customer-a',
  invoiceNumber: 'INV-001',
  saleDate: '2026-01-15',
  paymentMethod: PaymentMethod.CASH,
  items: [{ productId: 'product-a', quantity: '50.000', sellingPrice: '40.00' }],
};

describe('SalesService', () => {
  it('rolls back all writes when the second of three items has insufficient stock', async () => {
    const { service, store, txClient, prisma } = createFakeEnvironment({
      products: ['a', 'b', 'c'].map((id) => ({ id: `product-${id}`, businessId: 'business-a', status: 'ACTIVE', name: id })),
      openingStock: { 'product-a': '100', 'product-b': '2', 'product-c': '100' },
    });
    await expect(service.create('user-a', 'business-a', {
      ...saleInput,
      items: ['a', 'b', 'c'].map((id) => ({ productId: `product-${id}`, quantity: '10', sellingPrice: '5.00' })),
    })).rejects.toThrow('Insufficient stock');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txClient.sale.create).toHaveBeenCalledTimes(1);
    expect(txClient.saleItem.create).toHaveBeenCalledTimes(1);
    expect(txClient.inventoryTransaction.create).toHaveBeenCalledTimes(1);
    expect(store.sales).toEqual({});
    expect(store.saleItems).toEqual([]);
    expect(store.inventoryTransactions).toEqual([]);
    expect(Object.values(store.inventory).map((row) => row.quantity.toString())).toEqual(['100', '2', '100']);
  });

  it('allows selling the exact balance and writes a signed SALE ledger entry', async () => {
    const { service, store } = createFakeEnvironment({ openingStock: { 'product-a': '50' } });
    await service.create('user-a', 'business-a', saleInput);
    expect(store.inventory['product-a'].quantity.toString()).toBe('0');
    expect(store.inventoryTransactions[0]).toMatchObject({ type: 'SALE', quantity: new Prisma.Decimal(-50), balanceAfter: new Prisma.Decimal(0) });
  });

  it('rejects missing opening stock without persisting a sale', async () => {
    const { service, store } = createFakeEnvironment({ openingStock: {} });
    await expect(service.create('user-a', 'business-a', saleInput)).rejects.toThrow('Opening stock');
    expect(store.sales).toEqual({});
  });

  it('rejects fractional quantity for piece-based products', async () => {
    const { service, prisma } = createFakeEnvironment({
      products: [{ id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Handle', unit: 'PIECE' }],
    });
    await expect(service.create('user-a', 'business-a', {
      ...saleInput,
      items: [{ ...saleInput.items[0], quantity: '1.5' }],
    })).rejects.toThrow('whole pieces');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rounds line totals to cents before computing the total', async () => {
    const { service } = createFakeEnvironment();
    const result = await service.create('user-a', 'business-a', { ...saleInput, items: [{ productId: 'product-a', quantity: '0.125', sellingPrice: '0.12' }] });
    expect(result.total.toString()).toBe('0.02');
    expect(result.items[0].lineTotal.toString()).toBe('0.02');
  });

  it.each(['NaN', 'Infinity', '-1', '1.0001', '1000000000'])('rejects invalid quantity %s', async (quantity) => {
    const { service, prisma } = createFakeEnvironment();
    await expect(service.create('user-a', 'business-a', { ...saleInput, items: [{ ...saleInput.items[0], quantity }] })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects empty items, invalid payment methods and invalid dates', async () => {
    const { service } = createFakeEnvironment();
    for (const input of [{ items: [] }, { paymentMethod: 'INVALID' as PaymentMethod }, { saleDate: 'not-a-date' }]) {
      await expect(service.create('user-a', 'business-a', { ...saleInput, ...input })).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rejects inactive membership before accessing customer data', async () => {
    const { service, prisma } = createFakeEnvironment({ isActive: false });
    await expect(service.create('user-a', 'business-a', saleInput)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
  });

  it('scopes sale history and detail lookups to the business', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
      businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'MEMBER', roleDefinition: { permissions: [...DEFAULT_ROLE_PERMISSIONS.MEMBER] } }) },
      sale: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new SalesService(prisma as never, {} as never);
    await service.list('user-a', 'business-a', { customerId: 'customer-a', search: 'INV' });
    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'business-a', customerId: 'customer-a', OR: [{ documentNumber: { contains: 'INV', mode: 'insensitive' } }, { invoiceNumber: { contains: 'INV', mode: 'insensitive' } }] } }));
    // History screens summarise every method used to pay, in order, so the list carries them.
    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ payments: { select: { method: true, kind: true }, orderBy: { paidAt: 'asc' } } }) }));
    await expect(service.get('user-a', 'business-a', 'sale-b')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sale.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sale-b', businessId: 'business-a' } }));
  });

  it('updates metadata without invoking inventory and denies cross-business updates', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
      businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'ADMIN', roleDefinition: { permissions: [...DEFAULT_ROLE_PERMISSIONS.ADMIN] } }) },
      sale: { findFirst: vi.fn().mockResolvedValue({ id: 'sale-a' }), update: vi.fn().mockResolvedValue({ id: 'sale-a', note: 'corrected' }) },
    };
    const inventory = { applyMovement: vi.fn() };
    const service = new SalesService(prisma as never, inventory as never);
    await expect(service.update('user-a', 'business-a', 'sale-a', { note: 'corrected' })).resolves.toMatchObject({ note: 'corrected' });
    expect(inventory.applyMovement).not.toHaveBeenCalled();
    prisma.sale.findFirst.mockResolvedValue(null);
    await expect(service.update('user-a', 'business-a', 'sale-b', { note: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sale.update).toHaveBeenCalledTimes(1);
  });
  it('creates a sale, sale items, and decreases inventory via a SALE transaction', async () => {
    const { store, service } = createFakeEnvironment();

    const result = await service.create('user-a', 'business-a', saleInput);

    expect(result.total.toString()).toBe('2000');
    expect(store.saleItems).toHaveLength(1);
    expect(store.inventory['product-a'].quantity.toString()).toBe('50');
    expect(store.inventoryTransactions).toHaveLength(1);
    expect((store.inventoryTransactions[0] as { type: string }).type).toBe('SALE');
  });

  it('supports multiple sale items and computes the correct sale total', async () => {
    const { store, service } = createFakeEnvironment({
      products: [
        { id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Rice' },
        { id: 'product-b', businessId: 'business-a', status: 'ACTIVE', name: 'Sugar' },
      ],
      openingStock: { 'product-a': '100.000', 'product-b': '20.000' },
    });

    const result = await service.create('user-a', 'business-a', {
      ...saleInput,
      items: [
        { productId: 'product-a', quantity: '50.000', sellingPrice: '40.00' },
        { productId: 'product-b', quantity: '10.000', sellingPrice: '30.00' },
      ],
    });

    expect(result.total.toString()).toBe('2300');
    expect(store.saleItems).toHaveLength(2);
    expect(store.inventory['product-a'].quantity.toString()).toBe('50');
    expect(store.inventory['product-b'].quantity.toString()).toBe('10');
    expect(store.inventoryTransactions).toHaveLength(2);
  });

  it('rejects a sale for a customer outside the business (tenant isolation)', async () => {
    const { service } = createFakeEnvironment({ customer: null });

    await expect(service.create('user-a', 'business-a', saleInput)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a sale for an inactive customer', async () => {
    const { service } = createFakeEnvironment({ customer: { id: 'customer-a', businessId: 'business-a', status: 'INACTIVE' } });

    await expect(service.create('user-a', 'business-a', saleInput)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a sale referencing a product outside the business', async () => {
    const { service } = createFakeEnvironment({ products: [] });

    await expect(service.create('user-a', 'business-a', saleInput)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a sale referencing an inactive product', async () => {
    const { service } = createFakeEnvironment({ products: [{ id: 'product-a', businessId: 'business-a', status: 'INACTIVE', name: 'Rice' }] });

    await expect(service.create('user-a', 'business-a', saleInput)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an invalid (non-positive) quantity', async () => {
    const { service } = createFakeEnvironment();

    await expect(
      service.create('user-a', 'business-a', { ...saleInput, items: [{ productId: 'product-a', quantity: '0.000', sellingPrice: '40.00' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid (non-positive) sale price', async () => {
    const { service } = createFakeEnvironment();

    await expect(
      service.create('user-a', 'business-a', { ...saleInput, items: [{ productId: 'product-a', quantity: '10.000', sellingPrice: '0.00' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate products within the same sale', async () => {
    const { service } = createFakeEnvironment();

    await expect(
      service.create('user-a', 'business-a', {
        ...saleInput,
        items: [
          { productId: 'product-a', quantity: '10.000', sellingPrice: '40.00' },
          { productId: 'product-a', quantity: '5.000', sellingPrice: '40.00' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a pack and loose pieces of one product as separate lines and deducts both', async () => {
    const handle = { id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Handle', unit: 'PIECE', sellingOptions: [{ id: 'pack-10', name: 'Pack of 10', unit: 'PACK', quantity: '1', sellingPrice: '1700.00', piecesPerUnit: 10 }] };
    const { service, store } = createFakeEnvironment({ products: [handle as never], openingStock: { 'product-a': '200' } });

    await service.create('user-a', 'business-a', {
      ...saleInput,
      items: [
        { productId: 'product-a', sellingOptionId: 'pack-10', quantity: '1', sellingPrice: '1700.00' },
        { productId: 'product-a', quantity: '3', sellingPrice: '180.00' },
      ],
    });

    expect(store.saleItems).toHaveLength(2);
    expect(store.inventory['product-a'].quantity.toString()).toBe('187');
  });

  it('checks stock across all lines of the same product and rolls back on oversell', async () => {
    const handle = { id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Handle', unit: 'PIECE', sellingOptions: [{ id: 'pack-10', name: 'Pack of 10', unit: 'PACK', quantity: '1', sellingPrice: '1700.00', piecesPerUnit: 10 }] };
    const { service, store } = createFakeEnvironment({ products: [handle as never], openingStock: { 'product-a': '12' } });

    await expect(service.create('user-a', 'business-a', {
      ...saleInput,
      items: [
        { productId: 'product-a', sellingOptionId: 'pack-10', quantity: '1', sellingPrice: '1700.00' },
        { productId: 'product-a', quantity: '3', sellingPrice: '180.00' },
      ],
    })).rejects.toThrow();
    expect(store.inventory['product-a'].quantity.toString()).toBe('12');
    expect(store.saleItems).toHaveLength(0);
  });

  it('rejects two lines that sell a product the same way', async () => {
    const handle = { id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Handle', unit: 'PIECE', sellingOptions: [{ id: 'pack-10', name: 'Pack of 10', unit: 'PACK', quantity: '1', sellingPrice: '1700.00', piecesPerUnit: 10 }] };
    const { service, store } = createFakeEnvironment({ products: [handle as never], openingStock: { 'product-a': '200' } });
    const packLine = { productId: 'product-a', sellingOptionId: 'pack-10', quantity: '1', sellingPrice: '1700.00' };

    await expect(service.create('user-a', 'business-a', { ...saleInput, items: [packLine, packLine] })).rejects.toThrow('combine the quantity');
    expect(store.inventory['product-a'].quantity.toString()).toBe('200');
  });

  describe('invoice numbers', () => {
    it('numbers sales consecutively within the financial year and keeps the typed reference separate', async () => {
      const { service } = createFakeEnvironment();
      const first = await service.create('user-a', 'business-a', { ...saleInput, items: [{ productId: 'product-a', quantity: '1.000', sellingPrice: '40.00' }] });
      const second = await service.create('user-a', 'business-a', { ...saleInput, invoiceNumber: undefined, items: [{ productId: 'product-a', quantity: '1.000', sellingPrice: '40.00' }] });
      expect(first).toMatchObject({ documentNumber: 'INV/2025-26/0001', financialYear: '2025-26', documentSeq: 1, invoiceNumber: 'INV-001' });
      expect(second).toMatchObject({ documentNumber: 'INV/2025-26/0002', documentSeq: 2 });
    });

    it('uses no number for a sale that rolls back', async () => {
      const { service, store } = createFakeEnvironment({ openingStock: { 'product-a': '1' } });
      await expect(service.create('user-a', 'business-a', { ...saleInput, items: [{ productId: 'product-a', quantity: '2.000', sellingPrice: '40.00' }] })).rejects.toThrow('Insufficient stock');
      expect(store.counters).toEqual({});
      const sale = await service.create('user-a', 'business-a', { ...saleInput, items: [{ productId: 'product-a', quantity: '1.000', sellingPrice: '40.00' }] });
      expect(sale).toMatchObject({ documentNumber: 'INV/2025-26/0001' });
    });

    it('starts each financial year at 1 April in India', async () => {
      const { service } = createFakeEnvironment();
      const line = { items: [{ productId: 'product-a', quantity: '1.000', sellingPrice: '40.00' }] };
      const lastOfYear = await service.create('user-a', 'business-a', { ...saleInput, ...line, saleDate: '2026-03-31T18:29:59Z' });
      const firstOfYear = await service.create('user-a', 'business-a', { ...saleInput, ...line, saleDate: '2026-03-31T18:30:00Z' });
      expect(lastOfYear).toMatchObject({ documentNumber: 'INV/2025-26/0001' });
      expect(firstOfYear).toMatchObject({ documentNumber: 'INV/2026-27/0001' });
    });

    it('rejects a sale dated more than a day in the future', async () => {
      const { service, store } = createFakeEnvironment();
      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await expect(service.create('user-a', 'business-a', { ...saleInput, saleDate: future })).rejects.toThrow('in the future');
      expect(store.counters).toEqual({});
    });
  });

  describe('GST invoice details', () => {
    const SHOP_MH = '27AAPFU0939F1ZV';
    const BUYER_KA = '29AAPFU0939F1ZR';
    const glass = { id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Glass', unit: 'KG', hsnCode: '70052910' };
    const taxed = { ...saleInput, items: [{ productId: 'product-a', quantity: '1.000', sellingPrice: '40.00' }] };

    it("copies the shop's and customer's GST details and each line's HSN code onto the sale", async () => {
      const { service, store } = createFakeEnvironment({ shop: { gstin: SHOP_MH, stateCode: '27' }, customer: { id: 'customer-a', businessId: 'business-a', status: 'ACTIVE', gstin: BUYER_KA }, products: [glass] });
      const sale = await service.create('user-a', 'business-a', taxed);
      expect(sale).toMatchObject({ sellerGstin: SHOP_MH, sellerStateCode: '27', buyerGstin: BUYER_KA, placeOfSupply: '29', taxType: 'INTER_STATE' });
      expect(store.saleItems).toEqual([expect.objectContaining({ hsnCode: '70052910' })]);
    });

    it('treats a customer without a GSTIN as a supply in the shop state', async () => {
      const { service, store } = createFakeEnvironment({ shop: { gstin: SHOP_MH, stateCode: '27' } });
      const sale = await service.create('user-a', 'business-a', taxed);
      expect(sale).toMatchObject({ sellerGstin: SHOP_MH, sellerStateCode: '27', buyerGstin: null, placeOfSupply: '27', taxType: 'INTRA_STATE' });
      expect(store.saleItems).toEqual([expect.objectContaining({ hsnCode: null })]);
    });

    it('marks sales of a shop without a GSTIN as a bill of supply', async () => {
      const { service } = createFakeEnvironment({ shop: { gstin: null, stateCode: '29' } });
      const sale = await service.create('user-a', 'business-a', taxed);
      expect(sale).toMatchObject({ sellerGstin: null, sellerStateCode: '29', placeOfSupply: '29', taxType: 'UNREGISTERED' });
    });
  });

  describe('optional GST', () => {
    const SHOP_MH = '27AAPFU0939F1ZV';
    const glass = { id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Glass', unit: 'KG', hsnCode: null, gstRate: '18' };
    const taxed = { ...saleInput, items: [{ productId: 'product-a', quantity: '1.000', sellingPrice: '1000.00' }] };
    const amounts = (sale: Record<string, unknown>) => [sale.chargeGst, String(sale.taxTotal), String(sale.total)];

    it('charges no GST on any line when turned off, after the discount, and keeps the invoice number', async () => {
      const { service, store } = createFakeEnvironment({ shop: { gstin: SHOP_MH, stateCode: '27' }, products: [glass] });
      const sale = await service.create('user-a', 'business-a', { ...taxed, chargeGst: false, discountAmount: '100', expectedTotal: '900.00' }) as Record<string, unknown>;
      expect(amounts(sale)).toEqual([false, '0', '900']);
      expect(sale).toMatchObject({ documentNumber: 'INV/2025-26/0001', taxType: 'INTRA_STATE', sellerGstin: SHOP_MH });
      expect(store.saleItems).toEqual([expect.objectContaining({ gstRate: new Prisma.Decimal(0), taxAmount: new Prisma.Decimal(0), discountAmount: new Prisma.Decimal(100) })]);
    });

    it('charges GST as before when the choice is on or missing (bills queued by older apps)', async () => {
      const { service } = createFakeEnvironment({ shop: { gstin: SHOP_MH, stateCode: '27' }, products: [glass], openingStock: { 'product-a': '10' } });
      expect(amounts(await service.create('user-a', 'business-a', { ...taxed, chargeGst: true }) as Record<string, unknown>)).toEqual([true, '180', '1180']);
      expect(amounts(await service.create('user-a', 'business-a', { ...taxed, expectedTotal: '1180.00' }) as Record<string, unknown>)).toEqual([true, '180', '1180']);
    });

    it('refuses GST on a sale from a shop without a GSTIN, before any stock or number is used', async () => {
      const { service, store } = createFakeEnvironment({ products: [glass] });
      await expect(service.create('user-a', 'business-a', { ...taxed, chargeGst: true })).rejects.toThrow(new BadRequestException('Add the shop GSTIN in Shop details to charge GST on sales.'));
      expect([store.sales, store.counters, store.inventory['product-a'].quantity.toString()]).toEqual([{}, {}, '100']);
      expect(amounts(await service.create('user-a', 'business-a', { ...taxed, chargeGst: false }) as Record<string, unknown>)).toEqual([false, '0', '1000']);
    });
  });

  describe('walk-in customer', () => {
    const walkIn = { id: 'walkin_business-a', businessId: 'business-a', status: 'ACTIVE', gstin: null, isWalkIn: true };
    const line = { items: [{ productId: 'product-a', quantity: '1.000', sellingPrice: '40.00' }] };

    it('sells to the walk-in customer only when paid in full', async () => {
      const { service, store } = createFakeEnvironment({ customer: walkIn });
      for (const amountPaid of ['0', '10.00', undefined]) {
        await expect(service.create('user-a', 'business-a', { ...saleInput, ...line, amountPaid })).rejects.toThrow('paid in full');
      }
      expect(store.sales).toEqual({});
      const sale = await service.create('user-a', 'business-a', { ...saleInput, ...line, amountPaid: '40.00' });
      expect(String(sale.amountPaid)).toBe('40');
    });
  });

  describe('bill discount', () => {
    const products = [
      { id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Glass', unit: 'KG', hsnCode: null, gstRate: '18' },
      { id: 'product-b', businessId: 'business-a', status: 'ACTIVE', name: 'Putty', unit: 'KG', hsnCode: null, gstRate: '5' },
    ];
    const items = [{ productId: 'product-a', quantity: '1.000', sellingPrice: '1000.00' }, { productId: 'product-b', quantity: '1.000', sellingPrice: '200.00' }];
    const environment = () => createFakeEnvironment({ products, openingStock: { 'product-a': '10', 'product-b': '10' } });
    const line = (store: { saleItems: unknown[] }, productId: string) => {
      const item = store.saleItems.find((entry) => (entry as { productId: string }).productId === productId) as { discountAmount: Prisma.Decimal; taxAmount: Prisma.Decimal };
      return [item.discountAmount.toString(), item.taxAmount.toString()];
    };

    it('splits a percentage across the lines and charges GST on the discounted amounts', async () => {
      const { service, store } = environment();
      const sale = await service.create('user-a', 'business-a', { ...saleInput, items, discountPercent: '10' });
      // 10% of 1200 is 120: 100 off the 18% line (GST 162) and 20 off the 5% line (GST 9).
      expect([sale.subtotal, sale.discountTotal, sale.discountPercent, sale.taxTotal, sale.total].map(String)).toEqual(['1200', '120', '10', '171', '1251']);
      expect(line(store, 'product-a')).toEqual(['100', '162']);
      expect(line(store, 'product-b')).toEqual(['20', '9']);
    });

    it('gives an odd paisa of an amount discount to the line with the largest remainder', async () => {
      const { service, store } = environment();
      const sale = await service.create('user-a', 'business-a', { ...saleInput, items, discountAmount: '0.01' });
      expect([sale.discountTotal, sale.discountPercent, sale.taxTotal, sale.total].map(String)).toEqual(['0.01', 'null', '190', '1389.99']);
      expect(line(store, 'product-a')).toEqual(['0.01', '180']);
      expect(line(store, 'product-b')).toEqual(['0', '10']);
    });

    it('rejects a discount above the subtotal or given both ways, without a sale or stock change', async () => {
      const { service, store } = environment();
      await expect(service.create('user-a', 'business-a', { ...saleInput, items, discountAmount: '1200.01' })).rejects.toThrow('up to the bill subtotal');
      await expect(service.create('user-a', 'business-a', { ...saleInput, items, discountAmount: '10', discountPercent: '5' })).rejects.toThrow('not both');
      expect(store.sales).toEqual({});
      expect(store.inventory['product-a'].quantity.toString()).toBe('10');
    });

    it('confirms a queued bill against the discounted total', async () => {
      const { service } = environment();
      await expect(service.create('user-a', 'business-a', { ...saleInput, items, discountPercent: '10', expectedTotal: '1371.00' })).rejects.toBeInstanceOf(ConflictException);
      expect(String((await service.create('user-a', 'business-a', { ...saleInput, items, discountPercent: '10', expectedTotal: '1251.00' })).total)).toBe('1251');
    });
  });

  describe('editing a numbered sale', () => {
    const environment = (sale: Record<string, unknown>) => {
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, isPlatformAdmin: false }) },
        businessUser: { findUnique: vi.fn().mockResolvedValue({ business: { isActive: true }, isActive: true, role: 'ADMIN', roleDefinition: { permissions: [...DEFAULT_ROLE_PERMISSIONS.ADMIN] } }) },
        sale: { findFirst: vi.fn().mockResolvedValue(sale), update: vi.fn(async ({ data }: { data: object }) => ({ ...sale, ...data })) },
      };
      return { prisma, service: new SalesService(prisma as never, {} as never) };
    };
    const numbered = { id: 'sale-a', documentNumber: 'INV/2025-26/0004', financialYear: '2025-26' };

    it('allows a new date within the invoice financial year', async () => {
      const { service, prisma } = environment(numbered);
      await service.update('user-a', 'business-a', 'sale-a', { saleDate: '2026-03-31T18:00:00Z', note: 'moved' });
      expect(prisma.sale.update).toHaveBeenCalled();
    });

    it('rejects a date in another financial year and never changes the number', async () => {
      const { service, prisma } = environment(numbered);
      await expect(service.update('user-a', 'business-a', 'sale-a', { saleDate: '2026-03-31T18:30:00Z' })).rejects.toThrow('financial year 2025-26');
      expect(prisma.sale.update).not.toHaveBeenCalled();
      await service.update('user-a', 'business-a', 'sale-a', { invoiceNumber: 'REF-9' });
      expect(prisma.sale.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ documentNumber: expect.anything() }) }));
    });

    it('lets unnumbered (older) sales change date freely', async () => {
      const { service, prisma } = environment({ id: 'sale-a', documentNumber: null, financialYear: null });
      await service.update('user-a', 'business-a', 'sale-a', { saleDate: '2024-06-01' });
      expect(prisma.sale.update).toHaveBeenCalled();
    });
  });

  it('rejects a member without manager permissions from creating a sale', async () => {
    const { service } = createFakeEnvironment({ role: 'MEMBER' });

    await expect(service.create('user-a', 'business-a', saleInput)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rolls back the entire sale (sale, items, inventory transactions, inventory projection) when an inventory operation fails mid-transaction', async () => {
    const { store, service } = createFakeEnvironment({
      products: [
        { id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Rice' },
        { id: 'product-b', businessId: 'business-a', status: 'ACTIVE', name: 'Sugar' },
      ],
      openingStock: { 'product-a': '100.000', 'product-b': '20.000' },
      failInventoryOnProductId: 'product-b',
    });

    await expect(
      service.create('user-a', 'business-a', {
        ...saleInput,
        items: [
          { productId: 'product-a', quantity: '50.000', sellingPrice: '40.00' },
          { productId: 'product-b', quantity: '10.000', sellingPrice: '30.00' },
        ],
      }),
    ).rejects.toThrow();

    // The failure occurs on the second item (product-b), after the Sale
    // record, first SaleItem, and the first item's inventory movement
    // (product-a) have already been written inside the transaction. A real
    // Postgres transaction rolls back ALL of these together — verify none of
    // them persisted, not just the failed item.
    expect(Object.keys(store.sales)).toHaveLength(0);
    expect(store.saleItems).toHaveLength(0);
    expect(store.inventory['product-a'].quantity.toString()).toBe('100');
    expect(store.inventory['product-b'].quantity.toString()).toBe('20');
    expect(store.inventoryTransactions).toHaveLength(0);
  });
});


describe('Retail sales of grouped products', () => {
  it.each([['DOZEN', 12], ['BOX', 24], ['PACK', 6]])('sells every piece of a %s without stock drift', async (unit, size) => {
    const { service, store } = createFakeEnvironment({ products: [{ id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Grouped product', unit, piecesPerUnit: size }], openingStock: { 'product-a': String(size) } });
    for (let count = 0; count < size; count++) {
      await service.create('user-a', 'business-a', { ...saleInput, items: [{ productId: 'product-a', unit: 'PIECE', quantity: '1', sellingPrice: '10.00' }] });
    }
    expect(store.inventory['product-a'].quantity.toString()).toBe('0');
    expect(store.saleItems).toHaveLength(size);
    expect(store.saleItems[0]).toMatchObject({ unit: 'PIECE' });
    await expect(service.create('user-a', 'business-a', { ...saleInput, items: [{ productId: 'product-a', unit: 'PIECE', quantity: '1', sellingPrice: '10.00' }] })).rejects.toThrow('Insufficient stock');
  });

  it('deducts a full dozen as 12 pieces and keeps the dozen price', async () => {
    const { service, store } = createFakeEnvironment({ products: [{ id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Eggs', unit: 'DOZEN', piecesPerUnit: 12 }], openingStock: { 'product-a': '24' } });
    await service.create('user-a', 'business-a', { ...saleInput, items: [{ productId: 'product-a', unit: 'DOZEN', quantity: '1', sellingPrice: '120.00' }] });
    expect(store.inventory['product-a'].quantity.toString()).toBe('12');
    expect(store.saleItems[0]).toMatchObject({ unit: 'DOZEN', lineTotal: new Prisma.Decimal(120) });
  });

  it.each([['PIECE', '0.5'], ['KG', '1']])('rejects an invalid retail unit or fractional piece', async (unit, quantity) => {
    const { service } = createFakeEnvironment({ products: [{ id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Eggs', unit: 'DOZEN', piecesPerUnit: 12 }] });
    await expect(service.create('user-a', 'business-a', { ...saleInput, items: [{ productId: 'product-a', unit, quantity, sellingPrice: '10.00' }] })).rejects.toBeInstanceOf(BadRequestException);
  });
});


describe('Offline total confirmation', () => {
  it('rejects a changed total before creating any transaction or stock movement', async () => {
    const { service, store } = createFakeEnvironment();
    await expect(service.create('user-a', 'business-a', { ...saleInput, expectedTotal: '0.01' })).rejects.toBeInstanceOf(ConflictException);
    expect(Object.keys(store.sales)).toHaveLength(0);
    expect(store.inventoryTransactions).toHaveLength(0);
  });
});
