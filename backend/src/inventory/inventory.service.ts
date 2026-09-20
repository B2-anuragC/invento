import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { adjustmentTypes } from './dto/inventory.dto.js';
import { isInflowTransaction } from './inventory.movement-types.js';

export interface ApplyMovementInput {
  businessId: string;
  productId: string;
  type: InventoryTransactionType;
  /** Unsigned magnitude of the movement. Direction is derived from `type`. */
  quantity: Prisma.Decimal | string;
  note?: string;
  userId: string;
}

export interface OpeningStockInput {
  businessId: string;
  productId: string;
  quantity: Prisma.Decimal | string;
  note?: string;
  userId: string;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async openingStock(userId: string, businessId: string, input: { productId: string; quantity: string; note?: string }) {
    await this.requireManagerMembership(userId, businessId);
    await this.requireProduct(businessId, input.productId);

    return this.recordOpeningStock({ businessId, productId: input.productId, quantity: input.quantity, note: input.note, userId });
  }

  async adjust(userId: string, businessId: string, input: { productId: string; type: (typeof adjustmentTypes)[number]; quantity: string; note?: string }) {
    await this.requireManagerMembership(userId, businessId);
    await this.requireProduct(businessId, input.productId);

    const type = InventoryTransactionType[input.type];
    const delta = new Prisma.Decimal(input.quantity);
    if (delta.lessThanOrEqualTo(0)) throw new BadRequestException('Adjustment quantity must be greater than zero.');

    return this.applyMovement({ businessId, productId: input.productId, type, quantity: delta, note: input.note, userId });
  }

  async list(userId: string, businessId: string) {
    await this.requireMembership(userId, businessId);
    return this.prisma.inventory.findMany({
      where: { businessId },
      include: { product: { select: { id: true, name: true, sku: true, unit: true, status: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(userId: string, businessId: string, productId: string) {
    await this.requireMembership(userId, businessId);
    await this.requireProduct(businessId, productId);
    const inventory = await this.prisma.inventory.findUnique({ where: { productId } });
    return inventory ?? { businessId, productId, quantity: new Prisma.Decimal(0), createdAt: null, updatedAt: null };
  }

  async history(userId: string, businessId: string, productId: string) {
    await this.requireMembership(userId, businessId);
    await this.requireProduct(businessId, productId);
    return this.prisma.inventoryTransaction.findMany({
      where: { businessId, productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Records the opening stock for a product. This is the Inventory Engine's
   * single entry point for opening-stock creation and is safe to call from
   * other business flows that already hold a transaction client.
   *
   * Business ownership/authorization must be checked by the caller before
   * invoking this method directly (the public `openingStock()` wrapper does
   * this for HTTP callers).
   *
   * When `tx` is omitted, a new transaction is started (preserving today's
   * standalone behavior). When `tx` is provided, the write joins the
   * caller's existing transaction and no nested `$transaction` is started.
   */
  async recordOpeningStock(input: OpeningStockInput, tx?: Prisma.TransactionClient) {
    const quantity = this.validateQuantity(input.quantity, true);

    const run = async (client: Prisma.TransactionClient) => {
      const inventory = await client.inventory.create({
        data: {
          businessId: input.businessId,
          productId: input.productId,
          quantity,
        },
      });
      await client.inventoryTransaction.create({
        data: {
          businessId: input.businessId,
          productId: input.productId,
          type: InventoryTransactionType.OPENING_STOCK,
          quantity,
          balanceAfter: quantity,
          note: input.note,
          createdByUserId: input.userId,
        },
      });
      return inventory;
    };

    try {
      return tx ? await run(tx) : await this.prisma.$transaction((client) => run(client));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Opening stock has already been recorded for this product.');
      }
      throw error;
    }
  }

  /**
   * Applies a signed stock movement atomically: locks the inventory row,
   * computes the new balance, rejects if it would go negative, then writes
   * the immutable ledger entry and the updated projection together.
   *
   * This is the Inventory Engine's single entry point for stock mutations.
   * Purchase/Sale flows must call this method instead of reimplementing
   * stock calculations, negative-stock validation, ledger creation, or row
   * locking.
   *
   * Business ownership/authorization must be checked by the caller before
   * invoking this method directly (the public `adjust()` wrapper does this
   * for HTTP callers).
   *
   * When `tx` is omitted, a new transaction is started (preserving today's
   * standalone behavior). When `tx` is provided (e.g. by PurchaseService or
   * SaleService composing a Purchase/Sale + items + inventory movement into
   * one atomic commit), the row lock, balance check, and writes all join the
   * caller's existing transaction and no nested `$transaction` is started.
   */
  async applyMovement(input: ApplyMovementInput, tx?: Prisma.TransactionClient) {
    const magnitude = this.validateQuantity(input.quantity);

    const run = async (client: Prisma.TransactionClient) => {
      const locked = await client.$queryRaw<{ id: string; quantity: Prisma.Decimal }[]>(
        Prisma.sql`SELECT "id", "quantity" FROM "inventories" WHERE "productId" = ${input.productId} FOR UPDATE`,
      );
      if (!locked[0]) {
        throw new BadRequestException('Opening stock must be recorded before adjustments can be made.');
      }
      const current = new Prisma.Decimal(locked[0].quantity);

      const signedDelta = isInflowTransaction(input.type) ? magnitude : magnitude.negated();
      const balanceAfter = current.plus(signedDelta);
      if (balanceAfter.lessThan(0)) {
        throw new BadRequestException('Insufficient stock for this operation.');
      }

      await client.inventory.update({ where: { id: locked[0].id }, data: { quantity: balanceAfter } });
      return client.inventoryTransaction.create({
        data: {
          businessId: input.businessId,
          productId: input.productId,
          type: input.type,
          quantity: signedDelta,
          balanceAfter,
          note: input.note,
          createdByUserId: input.userId,
        },
      });
    };

    return tx ? run(tx) : this.prisma.$transaction((client) => run(client));
  }

  private validateQuantity(value: Prisma.Decimal | string, allowZero = false) {
    let quantity: Prisma.Decimal;
    try {
      quantity = new Prisma.Decimal(value);
    } catch {
      throw new BadRequestException('Invalid inventory quantity.');
    }
    if (!quantity.isFinite() || quantity.lessThan(0) || (!allowZero && quantity.isZero()) || quantity.decimalPlaces() > 3 || quantity.greaterThan('999999999.999')) {
      throw new BadRequestException('Inventory quantity must be finite, within range, and positive (zero is allowed for opening stock).');
    }
    return quantity;
  }

  private async requireProduct(businessId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  private async requireMembership(userId: string, businessId: string) {
    const membership = await this.prisma.businessUser.findUnique({ where: { businessId_userId: { businessId, userId } } });
    if (!membership?.isActive) throw new ForbiddenException('You do not have access to this business.');
    return membership;
  }

  private async requireManagerMembership(userId: string, businessId: string) {
    const membership = await this.requireMembership(userId, businessId);
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') throw new ForbiddenException('You do not have permission for this action.');
    return membership;
  }
}
