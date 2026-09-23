import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service.js';
import { SalesService } from './sales.service.js';

type InventoryRow = { id: string; businessId: string; productId: string; quantity: Prisma.Decimal };

function createFakeEnvironment(
  options: {
    role?: string;
    isActive?: boolean;
    customer?: { id: string; businessId: string; status: string } | null;
    products?: { id: string; businessId: string; status: string; name: string }[];
    openingStock?: Record<string, string>;
    failInventoryOnProductId?: string;
  } = {},
) {
  const role = options.role ?? 'OWNER';
  const isActive = options.isActive ?? true;
  const customer = options.customer === undefined ? { id: 'customer-a', businessId: 'business-a', status: 'ACTIVE' } : options.customer;
  const products = options.products ?? [{ id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Rice' }];

  const store: {
    sales: Record<string, unknown>;
    saleItems: unknown[];
    inventory: Record<string, InventoryRow>;
    inventoryTransactions: unknown[];
  } = { sales: {}, saleItems: [], inventory: {}, inventoryTransactions: [] };

  for (const [productId, quantity] of Object.entries(options.openingStock ?? { 'product-a': '100.000' })) {
    store.inventory[productId] = { id: `inventory-${productId}`, businessId: 'business-a', productId, quantity: new Prisma.Decimal(quantity) };
  }

  function buildTxClient() {
    return {
      $queryRaw: vi.fn(async (query: { values?: unknown[] }) => {
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
      sale: {
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
    };
  }

  const txClient = buildTxClient();

  const prisma = {
    businessUser: { findUnique: vi.fn(async () => (isActive ? { isActive, role } : { isActive: false, role })) },
    customer: { findFirst: vi.fn(async () => customer) },
    product: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => products.filter((p) => where.id.in.includes(p.id))) },
    sale: { findFirst: vi.fn(async () => null) },
    // Simulates real Postgres transaction semantics: writes made during the
    // callback mutate the store. On failure, restore the pre-transaction
    // snapshot. This models rollback, not database locking or isolation.
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const snapshotBefore = structuredClone({
        sales: store.sales,
        saleItems: store.saleItems,
        inventory: Object.fromEntries(Object.entries(store.inventory).map(([id, row]) => [id, { ...row, quantity: row.quantity.toString() }])),
        inventoryTransactions: store.inventoryTransactions,
      });
      try {
        return await callback(txClient);
      } catch (error) {
        store.sales = snapshotBefore.sales;
        store.saleItems = snapshotBefore.saleItems;
        store.inventory = Object.fromEntries(
          Object.entries(snapshotBefore.inventory).map(([id, row]) => [id, { ...row, quantity: new Prisma.Decimal(row.quantity) }]),
        );
        store.inventoryTransactions = snapshotBefore.inventoryTransactions;
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
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
      sale: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new SalesService(prisma as never, {} as never);
    await service.list('user-a', 'business-a', { customerId: 'customer-a', search: 'INV' });
    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'business-a', customerId: 'customer-a', invoiceNumber: { contains: 'INV', mode: 'insensitive' } } }));
    await expect(service.get('user-a', 'business-a', 'sale-b')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sale.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sale-b', businessId: 'business-a' } }));
  });

  it('updates metadata without invoking inventory and denies cross-business updates', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'ADMIN' }) },
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
