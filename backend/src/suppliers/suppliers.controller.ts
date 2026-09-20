import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { CreateSupplierDto, SupplierListQueryDto, UpdateSupplierDto } from './dto/supplier.dto.js';
import { SuppliersService } from './suppliers.service.js';

@ApiTags('Suppliers')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Business-Id', description: 'Business to access for this request.', required: true })
@UseGuards(AccessTokenGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateSupplierDto) {
    return this.suppliers.create(req.user.id, this.businessId(req), dto);
  }

  @Get()
  list(@Req() req: Request, @Query() query: SupplierListQueryDto) {
    return this.suppliers.list(req.user.id, this.businessId(req), query);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.suppliers.get(req.user.id, this.businessId(req), id);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(req.user.id, this.businessId(req), id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a supplier without deleting historical purchase data.' })
  deactivate(@Req() req: Request, @Param('id') id: string) {
    return this.suppliers.deactivate(req.user.id, this.businessId(req), id);
  }

  private businessId(req: Request): string {
    const businessId = req.headers['x-business-id'];
    if (typeof businessId !== 'string' || !businessId.trim()) {
      throw new BadRequestException('X-Business-Id header is required.');
    }
    return businessId.trim();
  }
}
