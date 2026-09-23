import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dashboardRange, DashboardService } from './dashboard.service.js';

describe('Dashboard business dates', () => {
  it('uses India midnight and an exclusive end boundary', () => {
    const range = dashboardRange({ from: '2026-09-20', to: '2026-09-20' });
    expect(range.start.toISOString()).toBe('2026-09-19T18:30:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-20T18:30:00.000Z');
  });

  it('defaults to 30 India calendar days even when UTC is on the previous day', () => {
    const range = dashboardRange({}, new Date('2026-09-20T20:00:00Z'));
    expect(range.from).toBe('2026-08-23');
    expect(range.to).toBe('2026-09-21');
  });

  it.each([
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-09-21', to: '2026-09-20' },
    { from: '2025-01-01', to: '2026-01-02' },
    { from: 'invalid', to: '2026-09-20' },
  ])('rejects invalid or excessive ranges %j', (query) => {
    expect(() => dashboardRange(query)).toThrow(BadRequestException);
  });

  it('fills missing days and sums decimal amounts without float arithmetic', async () => {
    const prisma = {
      businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: true }) },
      $queryRaw: vi.fn().mockResolvedValue([
        { date: '2026-09-19', total: new Prisma.Decimal('0.1'), count: 1 },
        { date: '2026-09-21', total: new Prisma.Decimal('0.2'), count: 2 },
      ]),
    };
    const result = await new DashboardService(prisma as never).sales('u', 'b', { from: '2026-09-19', to: '2026-09-21' });
    expect(result.total.toString()).toBe('0.3');
    expect(result.count).toBe(3);
    expect(result.days.map((day) => [day.date, day.total.toString(), day.count])).toEqual([
      ['2026-09-19', '0.1', 1], ['2026-09-20', '0', 0], ['2026-09-21', '0.2', 2],
    ]);
  });

  it('checks membership before querying aggregates', async () => {
    const prisma = { businessUser: { findUnique: vi.fn().mockResolvedValue(null) }, $queryRaw: vi.fn() };
    await expect(new DashboardService(prisma as never).sales('u', 'other', {})).rejects.toThrow(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
