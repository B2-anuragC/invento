import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, hashToken, signToken, verifyPassword, verifyToken } from './auth.crypto.js';
import type { AccessTokenPayload, AuthenticatedUser, RefreshTokenPayload } from './auth.types.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async register(input: { name: string; email: string; password: string; phone?: string }) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists.');
    const user = await this.prisma.user.create({
      data: { name: input.name.trim(), email, phone: input.phone?.trim(), passwordHash: await hashPassword(input.password) },
    });
    return this.issueSession(user);
  }

  async login(input: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    if (!user || !user.isActive || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    return this.issueSession(user);
  }

  async refresh(token: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = verifyToken<RefreshTokenPayload>(token, this.config.getOrThrow('JWT_REFRESH_SECRET'));
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!record || record.revokedAt || record.expiresAt <= new Date() || record.id !== payload.jti || !record.user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    return this.issueSession(record.user);
  }

  async logout(token: string) {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
    return { loggedOut: true };
  }

  verifyAccessToken(token: string, secret: string): AuthenticatedUser {
    const payload = verifyToken<AccessTokenPayload>(token, secret);
    if (payload.type !== 'access' || !payload.sub) throw new Error('Invalid token');
    return { id: payload.sub, name: '', email: '' };
  }

  private async issueSession(user: { id: string; name: string; email: string; phone?: string | null; avatarUrl?: string | null }) {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = signToken({ sub: user.id, type: 'access', exp: now + 900 }, this.config.getOrThrow('JWT_ACCESS_SECRET'));
    const id = randomUUID();
    const refreshToken = signToken({ sub: user.id, jti: id, type: 'refresh', exp: now + 2_592_000 }, this.config.getOrThrow('JWT_REFRESH_SECRET'));
    await this.prisma.refreshToken.create({ data: { id, tokenHash: hashToken(refreshToken), userId: user.id, expiresAt: new Date((now + 2_592_000) * 1000) } });
    return { accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, avatarUrl: user.avatarUrl } };
  }
}
