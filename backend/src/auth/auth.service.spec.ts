import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { hashPassword, signToken } from './auth.crypto.js';

describe('AuthService', () => {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'test-access-secret-12345678901234567890',
    JWT_REFRESH_SECRET: 'test-refresh-secret-12345678901234567890',
  });

  it('rejects refresh when another request has already consumed the token', async () => {
    const token = signToken({ jti: 'refresh-1', exp: Math.floor(Date.now() / 1000) + 60 }, config.getOrThrow('JWT_REFRESH_SECRET'));
    const tx = { refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), create: vi.fn() } };
    const prisma = {
      refreshToken: { findUnique: vi.fn().mockResolvedValue({ id: 'refresh-1', expiresAt: new Date(Date.now() + 60000), user: { isActive: true } }) },
      $transaction: vi.fn(async (callback) => callback(tx)),
    };
    await expect(new AuthService(prisma as never, config).refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'refresh-1', revokedAt: null, expiresAt: { gt: expect.any(Date) } } }));
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rolls back token consumption if creating the replacement session fails', async () => {
    const token = signToken({ jti: 'refresh-1', exp: Math.floor(Date.now() / 1000) + 60 }, config.getOrThrow('JWT_REFRESH_SECRET'));
    const record = { id: 'refresh-1', revokedAt: null as Date | null, expiresAt: new Date(Date.now() + 60000), user: { id: 'user-1', name: 'Owner', email: 'owner@test.local', isActive: true } };
    const tx = { refreshToken: {
      updateMany: vi.fn(async ({ data }) => { record.revokedAt = data.revokedAt; return { count: 1 }; }),
      create: vi.fn().mockRejectedValue(new Error('Session write failed')),
    } };
    const prisma = {
      refreshToken: { findUnique: vi.fn().mockResolvedValue(record), create: vi.fn() },
      $transaction: vi.fn(async (callback) => {
        const before = record.revokedAt;
        try { return await callback(tx); } catch (error) { record.revokedAt = before; throw error; }
      }),
    };
    await expect(new AuthService(prisma as never, config).refresh(token)).rejects.toThrow('Session write failed');
    expect(record.revokedAt).toBeNull();
    expect(tx.refreshToken.create).toHaveBeenCalledOnce();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('registers a user and returns an access and refresh token', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'user-1', name: data.name, email: data.email, phone: null, avatarUrl: null })),
      },
      refreshToken: { create: vi.fn().mockResolvedValue({}) },
    };
    const result = await new AuthService(prisma as never, config).register({ name: 'Shop Owner', email: 'OWNER@example.com', password: 'Correct Horse Battery Staple1!' });
    expect(result.user.email).toBe('owner@example.com');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('rejects invalid login credentials', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, passwordHash: await hashPassword('different password') }) },
    };
    await expect(new AuthService(prisma as never, config).login({ email: 'owner@example.com', password: 'wrong password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
