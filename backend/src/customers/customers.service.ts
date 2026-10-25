import { FilesService } from '../files/files.service.js';
import { BadRequestException } from '@nestjs/common';
import { requireBusinessMembership } from '../auth/business-access.js';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { customerStatuses } from './dto/customer.dto.js';

type CustomerInput = {
  imageOriginal?: string | null;
  imageThumbnail?: string | null;
  name?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: (typeof customerStatuses)[number];
};

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService, private readonly files?: FilesService) {}

  async create(userId: string, businessId: string, input: Required<Pick<CustomerInput, 'name'>> & Omit<CustomerInput, 'name' | 'status'>, clientId?: string) {
    await this.requireManagerMembership(userId, businessId);
    const images = await this.images(businessId, input);
    return this.prisma.customer.create({
      data: {
        ...images,
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

  async list(userId: string, businessId: string, query: { search?: string; status?: (typeof customerStatuses)[number] }) {
    await this.requireMembership(userId, businessId);
    const search = query.search?.trim();
    return this.prisma.customer.findMany({
      where: {
        businessId,
        status: query.status ? this.toStatus(query.status) : CustomerStatus.ACTIVE,
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

  async get(userId: string, businessId: string, customerId: string) {
    await this.requireMembership(userId, businessId);
    return this.requireCustomer(businessId, customerId);
  }

  async update(userId: string, businessId: string, customerId: string, input: CustomerInput) {
    await this.requireManagerMembership(userId, businessId);
    await this.requireCustomer(businessId, customerId);
    const images = await this.images(businessId, input);
    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...images,
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

  /** Deactivates a customer without deleting it, preserving historical sale records. */
  async deactivate(userId: string, businessId: string, customerId: string) {
    await this.requireManagerMembership(userId, businessId);
    await this.requireCustomer(businessId, customerId);
    return this.prisma.customer.update({ where: { id: customerId }, data: { revision: { increment: 1 }, status: CustomerStatus.INACTIVE } });
  }

  /**
   * Validates that a customer belongs to the business and is active. Intended
   * for reuse by other services (e.g. SaleService) that need to validate
   * a customer reference without duplicating the lookup/tenant-scoping logic.
   */
  async requireActiveCustomer(businessId: string, customerId: string) {
    const customer = await this.requireCustomer(businessId, customerId);
    if (customer.status !== CustomerStatus.ACTIVE) {
      throw new ConflictException('Customer is not active.');
    }
    return customer;
  }

  private async images(businessId: string, input: CustomerInput) {
    if (input.imageOriginal === undefined && input.imageThumbnail === undefined) return {};
    if (input.imageOriginal === null && input.imageThumbnail === null) return { imageOriginal: null, imageThumbnail: null };
    if (!input.imageOriginal || !this.files) throw new BadRequestException('Upload a customer photo or remove both versions.');
    const file = await this.files.reference(businessId, input.imageOriginal, 'customer');
    return { imageOriginal: file.url, imageThumbnail: file.thumbnailUrl };
  }

  private async requireCustomer(businessId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) throw new NotFoundException('Customer not found.');
    return customer;
  }

  private async requireMembership(userId: string, businessId: string) {
    return requireBusinessMembership(this.prisma, userId, businessId);
  }

  private async requireManagerMembership(userId: string, businessId: string) {
    const membership = await this.requireMembership(userId, businessId);
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') throw new ForbiddenException('You do not have permission for this action.');
    return membership;
  }

  private toStatus(status: (typeof customerStatuses)[number]) {
    return status === 'ACTIVE' ? CustomerStatus.ACTIVE : CustomerStatus.INACTIVE;
  }
}
