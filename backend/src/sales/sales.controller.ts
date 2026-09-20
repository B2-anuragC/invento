import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { CreateSaleDto, SaleListQueryDto, UpdateSaleDto } from './dto/sale.dto.js';
import { SalesService } from './sales.service.js';

@ApiTags('Sales')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Business-Id', description: 'Business to access for this request.', required: true })
@UseGuards(AccessTokenGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateSaleDto) {
    return this.sales.create(req.user.id, this.businessId(req), dto);
  }

  @Get()
  list(@Req() req: Request, @Query() query: SaleListQueryDto) {
    return this.sales.list(req.user.id, this.businessId(req), query);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.sales.get(req.user.id, this.businessId(req), id);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateSaleDto) {
    return this.sales.update(req.user.id, this.businessId(req), id, dto);
  }

  private businessId(req: Request): string {
    const businessId = req.headers['x-business-id'];
    if (typeof businessId !== 'string' || !businessId.trim()) {
      throw new BadRequestException('X-Business-Id header is required.');
    }
    return businessId.trim();
  }
}
