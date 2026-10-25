import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { PlatformAdminService } from './platform-admin.service.js';
import {
  AuditQueryDto,
  PageDto,
  PeriodDto,
  ReasonDto,
  StatusDto,
} from './platform-admin.dto.js';

@ApiTags('Platform administration')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, PlatformAdminGuard)
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly admin: PlatformAdminService) {}
  @Get('me') me(@Req() req: Request) {
    return this.admin.user(req.user.id);
  }
  @Get('overview') overview(@Query() query: PeriodDto) {
    return this.admin.overview(query);
  }
  @Get('businesses') businesses(@Query() query: PageDto) {
    return this.admin.businesses(query);
  }
  @Get('businesses/:id') business(@Param('id') id: string) {
    return this.admin.business(id);
  }
  @Get('businesses/:id/:resource') businessRecords(
    @Param('id') id: string,
    @Param('resource') resource: string,
    @Query() query: PageDto,
  ) {
    return this.admin.businessRecords(id, resource, query);
  }
  @Get('users') users(@Query() query: PageDto) {
    return this.admin.users(query);
  }
  @Get('users/:id') user(@Param('id') id: string) {
    return this.admin.user(id);
  }
  @Get('users/:id/:resource') userRecords(
    @Param('id') id: string,
    @Param('resource') resource: string,
    @Query() query: PageDto,
  ) {
    return this.admin.userRecords(id, resource, query);
  }
  @Get('audit-logs') logs(@Query() query: AuditQueryDto) {
    return this.admin.auditLogs(query);
  }
  @Patch('businesses/:id/status') businessStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() input: StatusDto,
  ) {
    return this.admin.manage(req.user.id, 'business', id, input);
  }
  @Patch('users/:id/status') userStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() input: StatusDto,
  ) {
    return this.admin.manage(req.user.id, 'user', id, input);
  }
  @Post('users/:id/revoke-sessions') revoke(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() input: ReasonDto,
  ) {
    return this.admin.manage(req.user.id, 'user', id, input, true);
  }
}
