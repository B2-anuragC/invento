import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardPageDto, DashboardRangeDto, DashboardTopProductsDto } from './dto/dashboard.dto.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Business-Id', required: true })
@UseGuards(AccessTokenGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Today in Asia/Kolkata: completed sales/purchases, active products, low stock, and latest 10 stock movements.' })
  summary(@Req() req: Request) { return this.dashboard.summary(req.user.id, this.businessId(req)); }

  @Get('sales')
  @ApiOperation({ summary: 'Daily completed sales; includes zero-activity days and decimal-string totals.' })
  sales(@Req() req: Request, @Query() query: DashboardRangeDto) { return this.dashboard.sales(req.user.id, this.businessId(req), query); }

  @Get('purchases')
  @ApiOperation({ summary: 'Daily completed purchases; includes zero-activity days and decimal-string totals.' })
  purchases(@Req() req: Request, @Query() query: DashboardRangeDto) { return this.dashboard.purchases(req.user.id, this.businessId(req), query); }

  @Get('low-stock')
  @ApiOperation({ summary: 'Active products strictly below minimum stock; uninitialized stock counts as zero. Ordered by name and ID.' })
  lowStock(@Req() req: Request, @Query() query: DashboardPageDto) { return this.dashboard.lowStock(req.user.id, this.businessId(req), query); }

  @Get('top-products')
  @ApiOperation({ summary: 'Products ranked by completed sales revenue, then ID; includes historical inactive products.' })
  topProducts(@Req() req: Request, @Query() query: DashboardTopProductsDto) { return this.dashboard.topProducts(req.user.id, this.businessId(req), query); }

  private businessId(req: Request) {
    const id = req.headers['x-business-id'];
    if (typeof id !== 'string' || !id.trim()) throw new BadRequestException('X-Business-Id header is required.');
    return id.trim();
  }
}
