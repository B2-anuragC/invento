import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { type Permission, PERMISSIONS } from '@invento/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  requireBusinessMembership,
  requireBusinessPermission,
  supportAccess,
} from '../auth/business-access.js';

/** Explicit handler allowlist: adding an endpoint never implicitly grants access. */
export function operationPermission(
  controller: string,
  handler: string,
): Permission | null {
  const domains: Record<string, string> = {
    ProductsController: 'products',
    CustomersController: 'customers',
    SuppliersController: 'suppliers',
    SalesController: 'sales',
    PurchasesController: 'purchases',
    InventoryController: 'inventory',
  };
  const domain = domains[controller];
  if (domain) {
    if (['list', 'get', 'search', 'categories'].includes(handler))
      return `${domain}.view` as Permission;
    if (handler === 'create') return `${domain}.create` as Permission;
    if (handler === 'update') return `${domain}.update` as Permission;
    if (handler === 'deactivate') return `${domain}.delete` as Permission;
    if (handler === 'recordPayment') return `${domain}.payments` as Permission;
    if (['stock', 'transactions', 'history', 'activity'].includes(handler))
      return 'inventory.view';
    if (['openingStock', 'adjust'].includes(handler)) return 'inventory.adjust';
  }
  if (
    controller === 'DashboardController' &&
    ['summary', 'sales', 'purchases', 'lowStock', 'topProducts'].includes(
      handler,
    )
  )
    return 'reports.view';
  if (controller === 'FilesController')
    return ['upload', 'enqueue', 'jobStatus'].includes(handler)
      ? 'files.upload'
      : handler === 'download'
        ? 'files.view'
        : null;
  if (controller === 'SyncController' && ['snapshot', 'push'].includes(handler))
    return 'business.view';
  if (controller === 'AccessManagementController')
    return (
      (
        {
          me: 'business.view',
          catalog: 'roles.view',
          roles: 'roles.view',
          createRole: 'roles.manage',
          updateRole: 'roles.manage',
          deleteRole: 'roles.manage',
          members: 'members.view',
          add: 'members.invite',
          update: 'members.update',
          audit: 'audit.view',
        } as Record<string, Permission>
      )[handler] ?? null
    );
  if (controller === 'BusinessesController')
    return (
      (
        {
          get: 'business.view',
          update: 'business.update',
          users: 'members.view',
          pricingAccess: 'business.view',
          updatePricingAccess: 'pricing.manage',
          addUser: 'members.invite',
          updateUser: 'members.update',
          removeUser: 'members.remove',
        } as Record<string, Permission>
      )[handler] ?? null
    );
  return null;
}
export type SupportRequest = Request & {
  auditedSupport?: { userId: string; businessId: string; auditId?: string };
};
@Injectable()
export class BusinessPermissionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<SupportRequest>();
    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    if (
      controller === 'BusinessesController' &&
      ['create', 'list'].includes(handler)
    )
      return true;
    const permission = operationPermission(controller, handler);
    if (!permission || !PERMISSIONS.includes(permission))
      throw new ForbiddenException('Operation has no permission policy.');
    const id =
      controller === 'BusinessesController'
        ? req.params.id
        : controller === 'AccessManagementController'
          ? req.params.businessId
          : req.headers['x-business-id'];
    if (typeof id !== 'string' || !id.trim())
      throw new BadRequestException('Select a business.');
    const suppliedReason = req.headers['x-platform-access-reason'];
    const platformMode = req.headers['x-platform-access'];
    if (platformMode !== undefined && platformMode !== 'business-management')
      throw new BadRequestException('Invalid platform access mode.');
    if (
      suppliedReason !== undefined &&
      (typeof suppliedReason !== 'string' ||
        suppliedReason.trim().length < 5 ||
        suppliedReason.length > 500)
    )
      throw new BadRequestException(
        'Support reason must contain 5–500 characters.',
      );
    if (
      platformMode === 'business-management' ||
      suppliedReason !== undefined
    ) {
      const reason =
        typeof suppliedReason === 'string'
          ? suppliedReason.trim()
          : 'Platform business management';
      const account = await this.prisma.user.findUnique({
        where: { id: req.user.id },
        select: { isActive: true, isPlatformAdmin: true },
      });
      const business = await this.prisma.business.findUnique({
        where: { id: id.trim() },
        select: { isActive: true },
      });
      if (!account?.isActive || !account.isPlatformAdmin || !business?.isActive)
        throw new ForbiddenException(
          'Active platform access and business required.',
        );
      const audit = await this.prisma.platformAuditLog.create({
        data: {
          actorId: req.user.id,
          action: 'BUSINESS_SUPPORT_ACCESS',
          targetType: 'business',
          targetId: id.trim(),
          businessId: id.trim(),
          reason: reason.trim(),
          previous: {},
          next: {
            method: req.method,
            operation: `${controller}.${handler}`,
            permission,
          },
        },
      });
      req.auditedSupport = {
        userId: req.user.id,
        businessId: id.trim(),
        auditId: audit.id,
      };
      return true;
    }
    if (
      (controller === 'AccessManagementController' && handler === 'me') ||
      controller === 'SyncController' ||
      (controller === 'BusinessesController' && handler === 'pricingAccess')
    )
      await requireBusinessMembership(this.prisma, req.user.id, id.trim());
    else
      await requireBusinessPermission(
        this.prisma,
        req.user.id,
        id.trim(),
        permission,
      );
    return true;
  }
}
@Injectable()
export class BusinessAccessInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const scope = context
      .switchToHttp()
      .getRequest<SupportRequest>().auditedSupport;
    return scope
      ? new Observable((subscriber) =>
          supportAccess.run(scope, () => next.handle().subscribe(subscriber)),
        )
      : next.handle();
  }
}
