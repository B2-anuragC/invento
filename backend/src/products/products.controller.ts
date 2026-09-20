import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { CreateProductDto, ProductListQueryDto, UpdateProductDto } from './dto/product.dto.js';
import { ProductsService } from './products.service.js';

@ApiTags('Products')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Business-Id', description: 'Business to access for this request.', required: true })
@UseGuards(AccessTokenGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateProductDto) {
    return this.products.create(req.user.id, this.businessId(req), dto);
  }

  @Get()
  list(@Req() req: Request, @Query() query: ProductListQueryDto) {
    return this.products.list(req.user.id, this.businessId(req), query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search products by name, SKU, or barcode.' })
  search(@Req() req: Request, @Query() query: ProductListQueryDto) {
    return this.products.search(req.user.id, this.businessId(req), query);
  }

  @Get(':id/stock')
  @ApiOperation({ summary: 'Get current inventory stock for a product.' })
  stock(@Req() req: Request, @Param('id') id: string) {
    return this.products.stock(req.user.id, this.businessId(req), id);
  }

  @Get(':id/transactions')
  @ApiOperation({ summary: 'Get the inventory transaction history for a product.' })
  transactions(@Req() req: Request, @Param('id') id: string) {
    return this.products.transactions(req.user.id, this.businessId(req), id);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.products.get(req.user.id, this.businessId(req), id);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(req.user.id, this.businessId(req), id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a product without deleting historical catalog data.' })
  deactivate(@Req() req: Request, @Param('id') id: string) {
    return this.products.deactivate(req.user.id, this.businessId(req), id);
  }

  private businessId(req: Request): string {
    const businessId = req.headers['x-business-id'];
    if (typeof businessId !== 'string' || !businessId.trim()) {
      throw new BadRequestException('X-Business-Id header is required.');
    }
    return businessId.trim();
  }
}
