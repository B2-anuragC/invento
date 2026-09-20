import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { CreateCustomerDto, CustomerListQueryDto, UpdateCustomerDto } from './dto/customer.dto.js';
import { CustomersService } from './customers.service.js';

@ApiTags('Customers')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Business-Id', description: 'Business to access for this request.', required: true })
@UseGuards(AccessTokenGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateCustomerDto) {
    return this.customers.create(req.user.id, this.businessId(req), dto);
  }

  @Get()
  list(@Req() req: Request, @Query() query: CustomerListQueryDto) {
    return this.customers.list(req.user.id, this.businessId(req), query);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.customers.get(req.user.id, this.businessId(req), id);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(req.user.id, this.businessId(req), id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a customer without deleting historical sale data.' })
  deactivate(@Req() req: Request, @Param('id') id: string) {
    return this.customers.deactivate(req.user.id, this.businessId(req), id);
  }

  private businessId(req: Request): string {
    const businessId = req.headers['x-business-id'];
    if (typeof businessId !== 'string' || !businessId.trim()) {
      throw new BadRequestException('X-Business-Id header is required.');
    }
    return businessId.trim();
  }
}
