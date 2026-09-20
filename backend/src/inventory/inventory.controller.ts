import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { InventoryAdjustmentDto, OpeningStockDto } from './dto/inventory.dto.js';
import { InventoryService } from './inventory.service.js';

@ApiTags('Inventory')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Business-Id', description: 'Business to access for this request.', required: true })
@UseGuards(AccessTokenGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('opening-stock')
  @ApiOperation({ summary: 'Record the opening stock for a product (once per product).' })
  openingStock(@Req() req: Request, @Body() dto: OpeningStockDto) {
    return this.inventory.openingStock(req.user.id, this.businessId(req), dto);
  }

  @Post('adjustments')
  @ApiOperation({ summary: 'Apply a stock adjustment (adjustment, damage, expiry, or return).' })
  adjust(@Req() req: Request, @Body() dto: InventoryAdjustmentDto) {
    return this.inventory.adjust(req.user.id, this.businessId(req), dto);
  }

  @Get()
  @ApiOperation({ summary: 'List current stock for every product in the business.' })
  list(@Req() req: Request) {
    return this.inventory.list(req.user.id, this.businessId(req));
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Get current stock for a product.' })
  get(@Req() req: Request, @Param('productId') productId: string) {
    return this.inventory.get(req.user.id, this.businessId(req), productId);
  }

  @Get(':productId/history')
  @ApiOperation({ summary: 'Get the immutable inventory transaction history for a product.' })
  history(@Req() req: Request, @Param('productId') productId: string) {
    return this.inventory.history(req.user.id, this.businessId(req), productId);
  }

  private businessId(req: Request): string {
    const businessId = req.headers['x-business-id'];
    if (typeof businessId !== 'string' || !businessId.trim()) {
      throw new BadRequestException('X-Business-Id header is required.');
    }
    return businessId.trim();
  }
}
