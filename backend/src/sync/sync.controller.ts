import { BusinessPermissionGuard, BusinessAccessInterceptor } from '../access/business-permission.guard.js';
import { UseInterceptors } from '@nestjs/common';
import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { SyncCommandDto } from './sync.dto.js';
import { SyncService } from './sync.service.js';
@ApiTags('Sync') @ApiBearerAuth() @ApiHeader({ name: 'X-Business-Id', required: true }) @UseInterceptors(BusinessAccessInterceptor)
@UseGuards(AccessTokenGuard, BusinessPermissionGuard) @Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}
  @Get('snapshot') snapshot(@Req() req: Request) { return this.sync.snapshot(req.user.id, this.business(req)); }
  @Post('push') push(@Req() req: Request, @Body() command: SyncCommandDto) { return this.sync.push(req.user.id, this.business(req), command); }
  private business(req: Request) {
    const id = req.headers['x-business-id'];
    if (typeof id !== 'string' || !id.trim()) throw new BadRequestException('X-Business-Id header is required.');
    return id.trim();
  }
}
