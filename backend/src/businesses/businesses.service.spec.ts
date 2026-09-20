import { ForbiddenException } from '@nestjs/common';
import { BusinessesService } from './businesses.service.js';

describe('BusinessesService authorization', () => {
  it('rejects users who are not active members', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: false }) },
    } as never;
    const service = new BusinessesService(prisma);
    await expect(service.get('user-a', 'business-b')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects members without manager role from updating a business', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true, role: 'MEMBER' }) },
    } as never;
    const service = new BusinessesService(prisma);
    await expect(service.update('user-a', 'business-a', { name: 'new' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
