import { EMAIL_TAKEN_MESSAGE } from '@invento/shared';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { hashPassword, signToken, verifyPassword } from './auth.crypto.js';

describe('AuthService', () => {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'test-access-secret-12345678901234567890',
    JWT_REFRESH_SECRET: 'test-refresh-secret-12345678901234567890',
  });

  it('rejects refresh when another request has already consumed the token', async () => {
    const token = signToken({ jti: 'refresh-1', exp: Math.floor(Date.now() / 1000) + 60 }, config.getOrThrow('JWT_REFRESH_SECRET'));
    const tx = { $queryRaw: vi.fn(), user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', isActive: true }) }, refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), create: vi.fn() } };
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
    const tx = { $queryRaw: vi.fn(), user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', isActive: true }) }, refreshToken: {
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

  describe('register', () => {
    const registering = (existing: object | null = null) => ({
      user: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'user-1', phone: null, avatarUrl: null, isPlatformAdmin: false, sessionVersion: 0, ...data })),
      },
      refreshToken: { create: vi.fn().mockResolvedValue({}) },
    });
    const input = { name: '  Shop Owner  ', email: '  OWNER@Example.com ', password: 'Correct Horse Battery Staple1!' };

    it('stores the email trimmed and lowercased, and the name trimmed', async () => {
      const prisma = registering();
      await new AuthService(prisma as never, config).register(input);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'owner@example.com' } });
      expect(prisma.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'owner@example.com', name: 'Shop Owner' }) });
    });

    it('rejects an email that already has an account without creating another', async () => {
      const prisma = registering({ id: 'user-0' });
      const register = new AuthService(prisma as never, config).register(input);
      await expect(register).rejects.toBeInstanceOf(ConflictException);
      await expect(register).rejects.toThrow(EMAIL_TAKEN_MESSAGE);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('stores a hash of the password, never the password itself', async () => {
      const prisma = registering();
      await new AuthService(prisma as never, config).register(input);
      const { passwordHash } = prisma.user.create.mock.calls[0][0].data;
      expect(passwordHash).not.toBe(input.password);
      await expect(verifyPassword(input.password, passwordHash)).resolves.toBe(true);
    });

    it('cannot grant platform rights and returns no private account fields', async () => {
      const prisma = registering();
      const result = await new AuthService(prisma as never, config).register({ ...input, isPlatformAdmin: true } as never);
      expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty('isPlatformAdmin');
      expect(Object.keys(result.user).sort()).toEqual(['avatarUrl', 'email', 'id', 'name', 'phone']);
      expect(prisma.refreshToken.create).toHaveBeenCalledOnce();
    });
  });

  it('updates only the authenticated user profile fields and clears a blank phone', async () => {
    const updatedUser = { id: 'user-1', name: 'Updated Owner', email: 'owner@test.local', phone: null, avatarUrl: null };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ isActive: true }),
        update: vi.fn().mockResolvedValue(updatedUser),
      },
    };
    const result = await new AuthService(prisma as never, config).updateProfile('user-1', {
      name: ' Updated Owner ',
      phone: '   ',
    });

    expect(result).toEqual(updatedUser);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Updated Owner', phone: null },
      select: { id: true, name: true, email: true, phone: true, avatarUrl: true },
    });
  });

  it('rejects profile updates for inactive or missing users', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
    await expect(new AuthService(prisma as never, config).updateProfile('user-1', { name: 'Updated Owner' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects invalid login credentials', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, passwordHash: await hashPassword('different password') }) },
    };
    await expect(new AuthService(prisma as never, config).login({ email: 'owner@example.com', password: 'wrong password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
