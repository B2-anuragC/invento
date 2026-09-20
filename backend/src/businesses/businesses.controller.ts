import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { AddBusinessUserDto, CreateBusinessDto, UpdateBusinessDto, UpdateBusinessUserDto } from './dto/business.dto.js';
import { BusinessesService } from './businesses.service.js';

@ApiTags('Businesses')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}
  @Post() create(@Req() req: Request, @Body() dto: CreateBusinessDto) { return this.businesses.create(req.user.id, dto); }
  @Get(':id') get(@Req() req: Request, @Param('id') id: string) { return this.businesses.get(req.user.id, id); }
  @Patch(':id') update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateBusinessDto) { return this.businesses.update(req.user.id, id, dto); }
  @Get(':id/users') users(@Req() req: Request, @Param('id') id: string) { return this.businesses.listUsers(req.user.id, id); }
  @Post(':id/users') addUser(@Req() req: Request, @Param('id') id: string, @Body() dto: AddBusinessUserDto) { return this.businesses.addUser(req.user.id, id, dto.email, dto.role); }
  @Patch(':id/users/:userId') updateUser(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string, @Body() dto: UpdateBusinessUserDto) { return this.businesses.updateUser(req.user.id, id, userId, dto.role); }
  @Delete(':id/users/:userId') removeUser(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string) { return this.businesses.removeUser(req.user.id, id, userId); }
}
