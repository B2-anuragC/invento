import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InventoryTransactionType, Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service.js';

type InventoryRow = { id: string; businessId: string; productId: string; quantity: Prisma.Decimal };

function createFakePrisma(options: { role?: string; isActive?: boolean; product?: { id: string; businessId: string } | null; failOpeningStockConflict?: boolean } = {}) {
  const role = options.role ?? 'OWNER';
  const isActive = options.isActive ?? true;
  const product = options.product === undefined ? { id: 'product-a', businessId: 'business-a' } : options.product;

  const store: { inventory: InventoryRow | null; transactions: unknown[] } = {
    inventory: null,
    transactions: [],
  };

  function buildClient() {
    return {
      $queryRaw: vi.fn(async () => (store.inventory ? [{ id: store.inventory.id, quantity: store.inventory.quantity }] : [])),
      inventory: {
        create: vi.fn(async ({ data }: { data: { businessId: string; productId: string; quantity: Prisma.Decimal } }) => {
          if (options.failOpeningStockConflict) {
            throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.0.0' });
          }
          store.inventory = { id: 'inventory-a', ...data };
          return store.inventory;
        }),
        update: vi.fn(async ({ data }: { data: { quantity: Prisma.Decimal } }) => {
          if (store.inventory) store.inventory.quantity = data.quantity;
          return store.inventory;
        }),
        findMany: vi.fn(async () => (store.inventory ? [store.inventory] : [])),
        findUnique: vi.fn(async () => store.inventory),
      },
      inventoryTransaction: {
        create: vi.fn(async ({ data }: { data: unknown }) => {
          store.transactions.push(data);
          return data;
        }),
        findMany: vi.fn(async () => store.transactions),
      },
    };
  }

  const txClient = buildClient();

  const prisma = {
    businessUser: { findUnique: vi.fn(async () => (isActive ? { isActive, role } : { isActive: false, role })) },
    product: { findFirst: vi.fn(async () => product) },
    inventory: txClient.inventory,
    inventoryTransaction: txClient.inventoryTransaction,
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(txClient)),
  } as never;

  return { prisma, store, txClient };
}

describe('InventoryService', () => {
  it('records opening stock and creates the projection plus ledger entry', async () => {
    const { prisma, store } = createFakePrisma();
    const service = new InventoryService(prisma);

    const result = await service.openingStock('user-a', 'business-a', { productId: 'product-a', quantity: '100.000' });

    expect(result.quantity.toString()).toBe('100');
    expect(store.transactions).toHaveLength(1);
    expect((store.transactions[0] as { type: string }).type).toBe('OPENING_STOCK');
  });

  it('rejects opening stock when it has already been recorded', async () => {
    const { prisma } = createFakePrisma({ failOpeningStockConflict: true });
    const service = new InventoryService(prisma);

    await expect(service.openingStock('user-a', 'business-a', { productId: 'product-a', quantity: '100.000' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('applies the mandatory verification sequence: 100 + 50 - 20 - 5 = 125', async () => {
    const { prisma } = createFakePrisma();
    const service = new InventoryService(prisma);

    await service.openingStock('user-a', 'business-a', { productId: 'product-a', quantity: '100.000' });
    await service.adjust('user-a', 'business-a', { productId: 'product-a', type: 'ADJUSTMENT_IN', quantity: '50.000' });
    await service.adjust('user-a', 'business-a', { productId: 'product-a', type: 'ADJUSTMENT_OUT', quantity: '20.000' });
    const last = await service.adjust('user-a', 'business-a', { productId: 'product-a', type: 'DAMAGE', quantity: '5.000' });

    expect(last.balanceAfter.toString()).toBe('125');

    const current = await service.get('user-a', 'business-a', 'product-a');
    expect(current.quantity.toString()).toBe('125');
  });

  it('rejects an adjustment that would make stock negative and leaves stock unchanged', async () => {
    const { prisma, store } = createFakePrisma();
    const service = new InventoryService(prisma);

    await service.openingStock('user-a', 'business-a', { productId: 'product-a', quantity: '10.000' });
    const transactionCountBefore = store.transactions.length;

    await expect(service.adjust('user-a', 'business-a', { productId: 'product-a', type: 'ADJUSTMENT_OUT', quantity: '20.000' })).rejects.toBeInstanceOf(BadRequestException);

    expect(store.inventory?.quantity.toString()).toBe('10');
    expect(store.transactions).toHaveLength(transactionCountBefore);
  });

  it('rejects adjustments before opening stock has been recorded', async () => {
    const { prisma } = createFakePrisma();
    const service = new InventoryService(prisma);

    await expect(service.adjust('user-a', 'business-a', { productId: 'product-a', type: 'ADJUSTMENT_IN', quantity: '5.000' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces tenant isolation by rejecting products outside the business', async () => {
    const { prisma } = createFakePrisma({ product: null });
    const service = new InventoryService(prisma);

    await expect(service.openingStock('user-a', 'business-a', { productId: 'product-b', quantity: '10.000' })).rejects.toThrow();
  });

  it('rejects adjustments from members without manager permissions', async () => {
    const { prisma } = createFakePrisma({ role: 'MEMBER' });
    const service = new InventoryService(prisma);

    await expect(service.adjust('user-a', 'business-a', { productId: 'product-a', type: 'ADJUSTMENT_IN', quantity: '5.000' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows any active member to read current stock', async () => {
    const { prisma } = createFakePrisma({ role: 'MEMBER' });
    const service = new InventoryService(prisma);

    await expect(service.get('user-a', 'business-a', 'product-a')).resolves.toBeDefined();
  });

  describe('transaction composability', () => {
    it('applyMovement starts its own transaction when no tx client is provided (standalone behavior preserved)', async () => {
      const { prisma, store } = createFakePrisma();
      const service = new InventoryService(prisma);

      await service.recordOpeningStock({ businessId: 'business-a', productId: 'product-a', quantity: '100.000', userId: 'user-a' });
      await service.applyMovement({ businessId: 'business-a', productId: 'product-a', type: InventoryTransactionType.ADJUSTMENT_IN, quantity: '10.000', userId: 'user-a' });

      expect((prisma as { $transaction: ReturnType<typeof vi.fn> }).$transaction).toHaveBeenCalledTimes(2);
      expect(store.inventory?.quantity.toString()).toBe('110');
    });

    it('applyMovement joins an existing transaction client without starting a nested transaction', async () => {
      const { prisma, store, txClient } = createFakePrisma();
      const service = new InventoryService(prisma);

      await service.recordOpeningStock({ businessId: 'business-a', productId: 'product-a', quantity: '100.000', userId: 'user-a' });

      const transactionSpy = (prisma as { $transaction: ReturnType<typeof vi.fn> }).$transaction;
      transactionSpy.mockClear();

      const result = await service.applyMovement(
        { businessId: 'business-a', productId: 'product-a', type: InventoryTransactionType.PURCHASE, quantity: '25.000', userId: 'user-a' },
        txClient as never,
      );

      expect(transactionSpy).not.toHaveBeenCalled();
      expect(result.balanceAfter.toString()).toBe('125');
      expect(store.inventory?.quantity.toString()).toBe('125');
    });

    it('recordOpeningStock joins an existing transaction client without starting a nested transaction', async () => {
      const { prisma, txClient } = createFakePrisma();
      const service = new InventoryService(prisma);

      const transactionSpy = (prisma as { $transaction: ReturnType<typeof vi.fn> }).$transaction;

      const result = await service.recordOpeningStock({ businessId: 'business-a', productId: 'product-a', quantity: '100.000', userId: 'user-a' }, txClient as never);

      expect(transactionSpy).not.toHaveBeenCalled();
      expect(result.quantity.toString()).toBe('100');
    });

    it('propagates insufficient-stock rejection when composed inside a caller-provided transaction, without writing anything', async () => {
      const { prisma, store, txClient } = createFakePrisma();
      const service = new InventoryService(prisma);

      await service.recordOpeningStock({ businessId: 'business-a', productId: 'product-a', quantity: '10.000', userId: 'user-a' });
      const transactionsBefore = store.transactions.length;

      await expect(
        service.applyMovement({ businessId: 'business-a', productId: 'product-a', type: InventoryTransactionType.SALE, quantity: '20.000', userId: 'user-a' }, txClient as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(store.inventory?.quantity.toString()).toBe('10');
      expect(store.transactions).toHaveLength(transactionsBefore);
    });

    it('shares the same inflow/outflow determination for PURCHASE and SALE as ADJUSTMENT_IN/OUT', async () => {
      const { prisma, store } = createFakePrisma();
      const service = new InventoryService(prisma);

      await service.recordOpeningStock({ businessId: 'business-a', productId: 'product-a', quantity: '100.000', userId: 'user-a' });
      const purchase = await service.applyMovement({ businessId: 'business-a', productId: 'product-a', type: InventoryTransactionType.PURCHASE, quantity: '50.000', userId: 'user-a' });
      expect(purchase.balanceAfter.toString()).toBe('150');

      const sale = await service.applyMovement({ businessId: 'business-a', productId: 'product-a', type: InventoryTransactionType.SALE, quantity: '20.000', userId: 'user-a' });
      expect(sale.balanceAfter.toString()).toBe('130');
      expect(store.inventory?.quantity.toString()).toBe('130');
    });
  });
});
