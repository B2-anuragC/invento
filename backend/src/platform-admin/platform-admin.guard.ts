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
    const { user } = context.switchToHttp().getRequest<Request>();
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isPlatformAdmin: true, isActive: true },
    });
    if (!account?.isActive || !account.isPlatformAdmin)
      throw new ForbiddenException('Platform administrator access required.');
    return true;
  }
}
