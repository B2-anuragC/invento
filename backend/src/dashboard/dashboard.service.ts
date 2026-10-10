import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { DashboardPageDto, DashboardRangeDto, DashboardTopProductsDto } from './dto/dashboard.dto.js';

const dayMs = 86_400_000;
const indiaOffsetMs = 19_800_000;
export const dashboardTimezone = 'Asia/Kolkata';

export function dashboardRange(query: DashboardRangeDto, now = new Date()) {
  const to = query.to ?? new Date(now.getTime() + indiaOffsetMs).toISOString().slice(0, 10);
  const parse = (value: string) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException('Dates must be valid YYYY-MM-DD calendar dates.');
    }
    return date.getTime();
  };
  const last = parse(to);
  const from = query.from ?? new Date(last - 29 * dayMs).toISOString().slice(0, 10);
  const first = parse(from);
  if (first > last || last - first >= 366 * dayMs) throw new BadRequestException('Date range must contain between 1 and 366 days.');
  return { from, to, timezone: dashboardTimezone, start: new Date(first - indiaOffsetMs), end: new Date(last + dayMs - indiaOffsetMs) };
}

type DayTotal = { date: string; total: Prisma.Decimal; count: number };
type LowStock = { productId: string; name: string; sku: string; unit: string; quantity: Prisma.Decimal; minimumStock: Prisma.Decimal };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string, businessId: string) {
    const membership = await this.requireMembership(userId, businessId);
    const canViewPurchasePrice = await this.canViewPurchasePrice(businessId, membership);
    const today = new Date(Date.now() + indiaOffsetMs).toISOString().slice(0, 10);
    const range = dashboardRange({ from: today, to: today });
    // A single snapshot keeps related metrics consistent during concurrent writes.
    return this.prisma.$transaction(async (tx) => {
      const sales = await tx.sale.aggregate({ where: { businessId, status: 'COMPLETED', saleDate: { gte: range.start, lt: range.end } }, _sum: { total: true }, _count: true });
      const purchases = await tx.purchase.aggregate({ where: { businessId, status: 'COMPLETED', purchaseDate: { gte: range.start, lt: range.end } }, _sum: { total: true }, _count: true });
      const productCount = await tx.product.count({ where: { businessId, status: 'ACTIVE' } });
      const [lowStock] = await tx.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count FROM products p
        LEFT JOIN inventories i ON i."productId" = p.id AND i."businessId" = p."businessId"
        WHERE p."businessId" = ${businessId} AND p.status = 'ACTIVE'
          AND COALESCE(i.quantity, 0) / COALESCE(p."piecesPerUnit", 1) < p."minimumStock"`);
      const storedTransactions = await tx.inventoryTransaction.findMany({
        where: { businessId }, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, productId: true, type: true, quantity: true, balanceAfter: true, createdAt: true, note: true, product: { select: { name: true, sku: true, unit: true, piecesPerUnit: true } } },
      });
      const recentTransactions = storedTransactions.map((row) => ({ ...row, quantity: row.quantity.div(row.product.piecesPerUnit ?? 1), balanceAfter: row.balanceAfter.div(row.product.piecesPerUnit ?? 1) }));
      return {
        date: today,
        timezone: dashboardTimezone,
        todaySales: sales._sum.total ?? new Prisma.Decimal(0),
        todayPurchases: canViewPurchasePrice ? purchases._sum.total ?? new Prisma.Decimal(0) : null,
        saleCount: sales._count,
        purchaseCount: purchases._count,
        productCount,
        lowStockCount: lowStock.count,
        recentTransactions,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async sales(userId: string, businessId: string, query: DashboardRangeDto) {
    await this.requireMembership(userId, businessId);
    const range = dashboardRange(query);
    const rows = await this.prisma.$queryRaw<DayTotal[]>(Prisma.sql`
      SELECT to_char("saleDate" + interval '5 hours 30 minutes', 'YYYY-MM-DD') AS date,
        SUM(total) AS total, COUNT(*)::int AS count
      FROM sales WHERE "businessId" = ${businessId} AND status = 'COMPLETED'
        AND "saleDate" >= ${range.start} AND "saleDate" < ${range.end}
      GROUP BY 1 ORDER BY 1`);
    return this.series(range, rows);
  }

  async purchases(userId: string, businessId: string, query: DashboardRangeDto) {
    const membership = await this.requireMembership(userId, businessId);
    const range = dashboardRange(query);
    const rows = await this.prisma.$queryRaw<DayTotal[]>(Prisma.sql`
      SELECT to_char("purchaseDate" + interval '5 hours 30 minutes', 'YYYY-MM-DD') AS date,
        SUM(total) AS total, COUNT(*)::int AS count
      FROM purchases WHERE "businessId" = ${businessId} AND status = 'COMPLETED'
        AND "purchaseDate" >= ${range.start} AND "purchaseDate" < ${range.end}
      GROUP BY 1 ORDER BY 1`);
    const result = this.series(range, rows);
    if (await this.canViewPurchasePrice(businessId, membership)) return result;
    return {
      ...result,
      total: null,
      days: result.days.map(({ date, count }) => ({ date, count, total: null })),
    };
  }

  async lowStock(userId: string, businessId: string, query: DashboardPageDto) {
    await this.requireMembership(userId, businessId);
    return this.prisma.$queryRaw<LowStock[]>(Prisma.sql`
      SELECT p.id AS "productId", p.name, p.sku, p.unit,
        COALESCE(i.quantity, 0) / COALESCE(p."piecesPerUnit", 1) AS quantity, p."minimumStock"
      FROM products p LEFT JOIN inventories i ON i."productId" = p.id AND i."businessId" = p."businessId"
      WHERE p."businessId" = ${businessId} AND p.status = 'ACTIVE'
        AND COALESCE(i.quantity, 0) / COALESCE(p."piecesPerUnit", 1) < p."minimumStock"
      ORDER BY p.name, p.id LIMIT ${query.limit} OFFSET ${query.offset}`);
  }

  async topProducts(userId: string, businessId: string, query: DashboardTopProductsDto) {
    await this.requireMembership(userId, businessId);
    const range = dashboardRange(query);
    const items = await this.prisma.$queryRaw<(Pick<LowStock, 'productId' | 'name' | 'sku' | 'unit'> & { quantity: Prisma.Decimal; revenue: Prisma.Decimal })[]>(Prisma.sql`
      SELECT p.id AS "productId", p.name, p.sku, p.unit, SUM(CASE WHEN i.unit = 'PIECE' THEN i.quantity * i."unitsPerOption" / COALESCE(p."piecesPerUnit", 1) ELSE i.quantity * i."unitsPerOption" END) AS quantity, SUM(i."lineTotal") AS revenue
      FROM sale_items i JOIN sales s ON s.id = i."saleId"
      JOIN products p ON p.id = i."productId" AND p."businessId" = s."businessId"
      WHERE s."businessId" = ${businessId} AND s.status = 'COMPLETED'
        AND s."saleDate" >= ${range.start} AND s."saleDate" < ${range.end}
      GROUP BY p.id ORDER BY revenue DESC, p.id LIMIT ${query.limit}`);
    return { from: range.from, to: range.to, timezone: range.timezone, items };
  }

  private series(range: ReturnType<typeof dashboardRange>, rows: DayTotal[]) {
    const byDate = new Map(rows.map((row) => [row.date, row]));
    const days: DayTotal[] = [];
    for (let time = range.start.getTime(); time < range.end.getTime(); time += dayMs) {
      const date = new Date(time + indiaOffsetMs).toISOString().slice(0, 10);
      days.push(byDate.get(date) ?? { date, total: new Prisma.Decimal(0), count: 0 });
    }
    return { from: range.from, to: range.to, timezone: range.timezone, total: rows.reduce((sum, row) => sum.plus(row.total), new Prisma.Decimal(0)), count: rows.reduce((sum, row) => sum + row.count, 0), days };
  }

  private async requireMembership(userId: string, businessId: string) {
    const membership = await this.prisma.businessUser.findUnique({ where: { businessId_userId: { businessId, userId } } });
    if (!membership?.isActive) throw new ForbiddenException('You do not have access to this business.');
    return membership;
  }

  private async canViewPurchasePrice(businessId: string, membership: { role: string }) {
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') return true;
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { membersCanViewPurchasePrice: true },
    });
    return business?.membersCanViewPurchasePrice !== false;
  }
}
