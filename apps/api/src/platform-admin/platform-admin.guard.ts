import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const { user } = req;
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isPlatformAdmin: true, isActive: true },
    });
    if (!account?.isActive || !account.isPlatformAdmin)
      throw new ForbiddenException('Platform administrator access required.');
    if (req.method === 'GET') await this.prisma.platformAuditLog.create({ data: { actorId: user.id, action: 'PLATFORM_DATA_READ', targetType: req.route?.path?.includes('businesses') ? 'business' : 'platform', targetId: typeof req.params?.id === 'string' ? req.params.id : 'directory', businessId: req.route?.path?.includes('businesses') && typeof req.params?.id === 'string' ? req.params.id : null, reason: 'Explicit platform administration request', previous: {}, next: { route: String(req.route?.path ?? '') } } });
    return true;
  }
}
