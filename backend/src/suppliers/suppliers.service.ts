import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { requireBusinessMembership } from '../auth/business-access.js';
import { SupplierStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { supplierStatuses } from './dto/supplier.dto.js';

type SupplierInput = {
  categories?: string[];
  productIds?: string[];
  name?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: (typeof supplierStatuses)[number];
};

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, businessId: string, input: Required<Pick<SupplierInput, 'name'>> & Omit<SupplierInput, 'name' | 'status'>, clientId?: string) {
    await this.requireManagerMembership(userId, businessId);
    await this.validateProducts(businessId, input.productIds);
    return this.prisma.supplier.create({
      data: {
        categories: input.categories,
        productIds: input.productIds,
        id: clientId,
        businessId,
        name: input.name.trim(),
        contactName: input.contactName?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
      },
    });
  }

  async list(userId: string, businessId: string, query: { search?: string; status?: (typeof supplierStatuses)[number] }) {
    await this.requireMembership(userId, businessId);
    const search = query.search?.trim();
    return this.prisma.supplier.findMany({
      where: {
        businessId,
        status: query.status ? this.toStatus(query.status) : SupplierStatus.ACTIVE,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { contactName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(userId: string, businessId: string, supplierId: string) {
    await this.requireMembership(userId, businessId);
    return this.requireSupplier(businessId, supplierId);
  }

  async update(userId: string, businessId: string, supplierId: string, input: SupplierInput) {
    await this.requireManagerMembership(userId, businessId);
    await this.requireSupplier(businessId, supplierId);
    await this.validateProducts(businessId, input.productIds);
    return this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        categories: input.categories,
        productIds: input.productIds,
        revision: { increment: 1 },
        name: input.name?.trim(),
        contactName: input.contactName === undefined ? undefined : input.contactName.trim() || null,
        phone: input.phone === undefined ? undefined : input.phone.trim() || null,
        email: input.email === undefined ? undefined : input.email.trim() || null,
        address: input.address === undefined ? undefined : input.address.trim() || null,
        status: input.status ? this.toStatus(input.status) : undefined,
      },
    });
  }

  /** Deactivates a supplier without deleting it, preserving historical purchase records. */
  async deactivate(userId: string, businessId: string, supplierId: string) {
    await this.requireManagerMembership(userId, businessId);
    await this.requireSupplier(businessId, supplierId);
    return this.prisma.supplier.update({ where: { id: supplierId }, data: { revision: { increment: 1 }, status: SupplierStatus.INACTIVE } });
  }

  /**
   * Validates that a supplier belongs to the business and is active. Intended
   * for reuse by other services (e.g. PurchaseService) that need to validate
   * a supplier reference without duplicating the lookup/tenant-scoping logic.
   */
  async requireActiveSupplier(businessId: string, supplierId: string) {
    const supplier = await this.requireSupplier(businessId, supplierId);
    if (supplier.status !== SupplierStatus.ACTIVE) {
      throw new ConflictException('Supplier is not active.');
    }
    return supplier;
  }

  private async validateProducts(businessId: string, productIds?: string[]) {
    if (!productIds?.length) return;
    const count = await this.prisma.product.count({ where: { businessId, id: { in: productIds } } });
    if (count !== new Set(productIds).size) throw new BadRequestException('Selected products must belong to this business.');
  }

  private async requireSupplier(businessId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, businessId } });
    if (!supplier) throw new NotFoundException('Supplier not found.');
    return supplier;
  }

  private async requireMembership(userId: string, businessId: string) {
    return requireBusinessMembership(this.prisma, userId, businessId);
  }

  private async requireManagerMembership(userId: string, businessId: string) {
    const membership = await this.requireMembership(userId, businessId);
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') throw new ForbiddenException('You do not have permission for this action.');
    return membership;
  }

  private toStatus(status: (typeof supplierStatuses)[number]) {
    return status === 'ACTIVE' ? SupplierStatus.ACTIVE : SupplierStatus.INACTIVE;
  }
}
