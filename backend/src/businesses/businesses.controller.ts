import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { AddBusinessUserDto, CreateBusinessDto, UpdateBusinessDto, UpdateBusinessUserDto, UpdatePricingAccessDto } from './dto/business.dto.js';
import { BusinessesService } from './businesses.service.js';

@ApiTags('Businesses')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}
  @Get() list(@Req() req: Request) { return this.businesses.listForUser(req.user.id); }
  @Post() create(@Req() req: Request, @Body() dto: CreateBusinessDto) { return this.businesses.create(req.user.id, dto); }
  @Get(':id') get(@Req() req: Request, @Param('id') id: string) { return this.businesses.get(req.user.id, id); }
  @Patch(':id') update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateBusinessDto) { return this.businesses.update(req.user.id, id, dto); }
  @Get(':id/users') users(@Req() req: Request, @Param('id') id: string) { return this.businesses.listUsers(req.user.id, id); }
  @Get(':id/pricing-access')
  @ApiOperation({ summary: 'Get the business purchase-price visibility setting and the current user role.' })
  pricingAccess(@Req() req: Request, @Param('id') id: string) { return this.businesses.getPricingAccess(req.user.id, id); }
  @Patch(':id/pricing-access')
  @ApiOperation({ summary: 'Set whether business members may view purchase prices. Requires an owner or admin role.' })
  updatePricingAccess(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePricingAccessDto) { return this.businesses.updatePricingAccess(req.user.id, id, dto.membersCanViewPurchasePrice); }
  @Post(':id/users') addUser(@Req() req: Request, @Param('id') id: string, @Body() dto: AddBusinessUserDto) { return this.businesses.addUser(req.user.id, id, dto.email, dto.role); }
  @Patch(':id/users/:userId') updateUser(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string, @Body() dto: UpdateBusinessUserDto) { return this.businesses.updateUser(req.user.id, id, userId, dto.role); }
  @Delete(':id/users/:userId') removeUser(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string) { return this.businesses.removeUser(req.user.id, id, userId); }
}
