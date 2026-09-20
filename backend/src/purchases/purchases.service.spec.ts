import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service.js';
import { PurchasesService } from './purchases.service.js';

type InventoryRow = { id: string; businessId: string; productId: string; quantity: Prisma.Decimal };

function createFakeEnvironment(
  options: {
    role?: string;
    isActive?: boolean;
    supplier?: { id: string; businessId: string; status: string } | null;
    products?: { id: string; businessId: string; status: string; name: string }[];
    openingStock?: Record<string, string>;
    failInventoryOnProductId?: string;
  } = {},
) {
  const role = options.role ?? 'OWNER';
  const isActive = options.isActive ?? true;
  const supplier = options.supplier === undefined ? { id: 'supplier-a', businessId: 'business-a', status: 'ACTIVE' } : options.supplier;
  const products = options.products ?? [{ id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Rice' }];

  const store: {
    purchases: Record<string, unknown>;
    purchaseItems: unknown[];
    inventory: Record<string, InventoryRow>;
    inventoryTransactions: unknown[];
  } = { purchases: {}, purchaseItems: [], inventory: {}, inventoryTransactions: [] };

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
      purchase: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const purchase = { id: 'purchase-a', ...data };
          store.purchases[purchase.id] = purchase;
          return purchase;
        }),
        findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
          const purchase = store.purchases[where.id];
          if (!purchase) throw new Error('not found');
          return { ...purchase, items: store.purchaseItems, supplier };
        }),
      },
      purchaseItem: {
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
          store.purchaseItems.push(...data);
          return { count: data.length };
        }),
      },
    };
  }

  const txClient = buildTxClient();

  const prisma = {
    businessUser: { findUnique: vi.fn(async () => (isActive ? { isActive, role } : { isActive: false, role })) },
    supplier: { findFirst: vi.fn(async () => supplier) },
    product: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => products.filter((p) => where.id.in.includes(p.id))) },
    purchase: { findFirst: vi.fn(async () => null) },
    // Simulates real Postgres transaction semantics: writes made during the
    // callback are staged into a snapshot and only merged into the
    // persistent `store` if the callback resolves. If it throws, the
    // snapshot is discarded and `store` is left exactly as it was before.
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const snapshotBefore = structuredClone({
        purchases: store.purchases,
        purchaseItems: store.purchaseItems,
        inventory: Object.fromEntries(Object.entries(store.inventory).map(([id, row]) => [id, { ...row, quantity: row.quantity.toString() }])),
        inventoryTransactions: store.inventoryTransactions,
      });
      try {
        return await callback(txClient);
      } catch (error) {
        store.purchases = snapshotBefore.purchases;
        store.purchaseItems = snapshotBefore.purchaseItems;
        store.inventory = Object.fromEntries(
          Object.entries(snapshotBefore.inventory).map(([id, row]) => [id, { ...row, quantity: new Prisma.Decimal(row.quantity) }]),
        );
        store.inventoryTransactions = snapshotBefore.inventoryTransactions;
        throw error;
      }
    }),
  } as never;

  const inventory = new InventoryService(prisma);
  const service = new PurchasesService(prisma, inventory);

  return { prisma, store, service };
}

const purchaseInput = {
  supplierId: 'supplier-a',
  invoiceNumber: 'INV-001',
  purchaseDate: '2026-01-15',
  items: [{ productId: 'product-a', quantity: '50.000', purchasePrice: '40.00' }],
};

describe('PurchasesService', () => {
  it('creates a purchase, purchase items, and increases inventory via a PURCHASE transaction', async () => {
    const { store, service } = createFakeEnvironment();

    const result = await service.create('user-a', 'business-a', purchaseInput);

    expect(result.total.toString()).toBe('2000');
    expect(store.purchaseItems).toHaveLength(1);
    expect(store.inventory['product-a'].quantity.toString()).toBe('150');
    expect(store.inventoryTransactions).toHaveLength(1);
    expect((store.inventoryTransactions[0] as { type: string }).type).toBe('PURCHASE');
  });

  it('supports multiple purchase items and computes the correct purchase total', async () => {
    const { store, service } = createFakeEnvironment({
      products: [
        { id: 'product-a', businessId: 'business-a', status: 'ACTIVE', name: 'Rice' },
        { id: 'product-b', businessId: 'business-a', status: 'ACTIVE', name: 'Sugar' },
      ],
      openingStock: { 'product-a': '100.000', 'product-b': '20.000' },
    });

    const result = await service.create('user-a', 'business-a', {
      ...purchaseInput,
      items: [
        { productId: 'product-a', quantity: '50.000', purchasePrice: '40.00' },
        { productId: 'product-b', quantity: '10.000', purchasePrice: '30.00' },
      ],
    });

    expect(result.total.toString()).toBe('2300');
    expect(store.purchaseItems).toHaveLength(2);
    expect(store.inventory['product-a'].quantity.toString()).toBe('150');
    expect(store.inventory['product-b'].quantity.toString()).toBe('30');
    expect(store.inventoryTransactions).toHaveLength(2);
  });

  it('rejects a purchase for a supplier outside the business (tenant isolation)', async () => {
    const { service } = createFakeEnvironment({ supplier: null });

    await expect(service.create('user-a', 'business-a', purchaseInput)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a purchase for an inactive supplier', async () => {
    const { service } = createFakeEnvironment({ supplier: { id: 'supplier-a', businessId: 'business-a', status: 'INACTIVE' } });

    await expect(service.create('user-a', 'business-a', purchaseInput)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a purchase referencing a product outside the business', async () => {
    const { service } = createFakeEnvironment({ products: [] });

    await expect(service.create('user-a', 'business-a', purchaseInput)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a purchase referencing an inactive product', async () => {
    const { service } = createFakeEnvironment({ products: [{ id: 'product-a', businessId: 'business-a', status: 'INACTIVE', name: 'Rice' }] });

    await expect(service.create('user-a', 'business-a', purchaseInput)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an invalid (non-positive) quantity', async () => {
    const { service } = createFakeEnvironment();

    await expect(
      service.create('user-a', 'business-a', { ...purchaseInput, items: [{ productId: 'product-a', quantity: '0.000', purchasePrice: '40.00' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid (non-positive) purchase price', async () => {
    const { service } = createFakeEnvironment();

    await expect(
      service.create('user-a', 'business-a', { ...purchaseInput, items: [{ productId: 'product-a', quantity: '10.000', purchasePrice: '0.00' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate products within the same purchase', async () => {
    const { service } = createFakeEnvironment();

    await expect(
      service.create('user-a', 'business-a', {
        ...purchaseInput,
        items: [
          { productId: 'product-a', quantity: '10.000', purchasePrice: '40.00' },
          { productId: 'product-a', quantity: '5.000', purchasePrice: '40.00' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a member without manager permissions from creating a purchase', async () => {
    const { service } = createFakeEnvironment({ role: 'MEMBER' });

    await expect(service.create('user-a', 'business-a', purchaseInput)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rolls back the entire purchase (purchase, items, inventory transactions, inventory projection) when an inventory operation fails mid-transaction', async () => {
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
        ...purchaseInput,
        items: [
          { productId: 'product-a', quantity: '50.000', purchasePrice: '40.00' },
          { productId: 'product-b', quantity: '10.000', purchasePrice: '30.00' },
        ],
      }),
    ).rejects.toThrow();

    // The failure occurs on the second item (product-b), after the Purchase
    // record, PurchaseItems, and the first item's inventory movement
    // (product-a) have already been written inside the transaction. A real
    // Postgres transaction rolls back ALL of these together — verify none of
    // them persisted, not just the failed item.
    expect(Object.keys(store.purchases)).toHaveLength(0);
    expect(store.purchaseItems).toHaveLength(0);
    expect(store.inventory['product-a'].quantity.toString()).toBe('100');
    expect(store.inventory['product-b'].quantity.toString()).toBe('20');
    expect(store.inventoryTransactions).toHaveLength(0);
  });
});
