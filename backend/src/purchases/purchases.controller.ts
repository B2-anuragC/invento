import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { CreatePurchaseDto, PurchaseListQueryDto, UpdatePurchaseDto } from './dto/purchase.dto.js';
import { PurchasesService } from './purchases.service.js';

@ApiTags('Purchases')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Business-Id', description: 'Business to access for this request.', required: true })
@UseGuards(AccessTokenGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreatePurchaseDto) {
    return this.purchases.create(req.user.id, this.businessId(req), dto);
  }

  @Get()
  list(@Req() req: Request, @Query() query: PurchaseListQueryDto) {
    return this.purchases.list(req.user.id, this.businessId(req), query);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.purchases.get(req.user.id, this.businessId(req), id);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePurchaseDto) {
    return this.purchases.update(req.user.id, this.businessId(req), id, dto);
  }

  private businessId(req: Request): string {
    const businessId = req.headers['x-business-id'];
    if (typeof businessId !== 'string' || !businessId.trim()) {
      throw new BadRequestException('X-Business-Id header is required.');
    }
    return businessId.trim();
  }
}
