import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { hashPassword } from './auth.crypto.js';

describe('AuthService', () => {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'test-access-secret-12345678901234567890',
    JWT_REFRESH_SECRET: 'test-refresh-secret-12345678901234567890',
  });

  it('registers a user and returns an access and refresh token', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'user-1', name: data.name, email: data.email, phone: null, avatarUrl: null })),
      },
      refreshToken: { create: vi.fn().mockResolvedValue({}) },
    } as never;
    const result = await new AuthService(prisma, config).register({ name: 'Shop Owner', email: 'OWNER@example.com', password: 'Correct Horse Battery Staple1!' });
    expect(result.user.email).toBe('owner@example.com');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('rejects invalid login credentials', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, passwordHash: await hashPassword('different password') }) },
    } as never;
    await expect(new AuthService(prisma, config).login({ email: 'owner@example.com', password: 'wrong password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
