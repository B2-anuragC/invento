import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService, private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Authentication required.');
    try {
      const payload = this.auth.verifyAccessToken(header.slice(7), this.config.getOrThrow<string>('JWT_ACCESS_SECRET'));
      const user = await this.prisma.user.findUnique({ where: { id: payload.id }, select: { isActive: true, sessionVersion: true } });
      if (!user?.isActive || user.sessionVersion !== payload.sessionVersion) throw new UnauthorizedException('Account is inactive.');
      // Conditional update throttles writes across instances without an in-memory cache.
      const now = new Date();
      await this.prisma.user.updateMany({
        where: { id: payload.id, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: new Date(now.getTime() - 300_000) } }] },
        data: { lastActivityAt: now },
      });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }
}
