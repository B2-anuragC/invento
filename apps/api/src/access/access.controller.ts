import {
  BusinessAccessInterceptor,
  BusinessPermissionGuard,
} from './business-permission.guard.js';
import { UseInterceptors } from '@nestjs/common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { AccessManagementService } from './access.service.js';
import {
  AddMemberDto,
  CreateRoleDto,
  UpdateMemberDto,
  UpdateRoleDto,
} from './access.dto.js';
@Controller('businesses/:businessId/access')
@UseInterceptors(BusinessAccessInterceptor)
@UseGuards(AccessTokenGuard, BusinessPermissionGuard)
export class AccessManagementController {
  constructor(private readonly access: AccessManagementService) {}
  @Get('me') me(@Req() req: Request, @Param('businessId') id: string) {
    return this.access.me(req.user.id, id);
  }
  @Get('catalog') catalog(
    @Req() req: Request,
    @Param('businessId') id: string,
  ) {
    return this.access.catalog(req.user.id, id);
  }
  @Get('roles') roles(@Req() req: Request, @Param('businessId') id: string) {
    return this.access.roles(req.user.id, id);
  }
  @Post('roles') createRole(
    @Req() req: Request,
    @Param('businessId') id: string,
    @Body() input: CreateRoleDto,
  ) {
    return this.access.createRole(req.user.id, id, input);
  }
  @Patch('roles/:key') updateRole(
    @Req() req: Request,
    @Param('businessId') id: string,
    @Param('key') key: string,
    @Body() input: UpdateRoleDto,
  ) {
    return this.access.updateRole(req.user.id, id, key, input);
  }
  @Delete('roles/:key') deleteRole(
    @Req() req: Request,
    @Param('businessId') id: string,
    @Param('key') key: string,
  ) {
    return this.access.updateRole(req.user.id, id, key, {}, true);
  }
  @Get('members') members(
    @Req() req: Request,
    @Param('businessId') id: string,
  ) {
    return this.access.members(req.user.id, id);
  }
  @Post('members') add(
    @Req() req: Request,
    @Param('businessId') id: string,
    @Body() input: AddMemberDto,
  ) {
    return this.access.addMember(req.user.id, id, input);
  }
  @Patch('members/:userId') update(
    @Req() req: Request,
    @Param('businessId') id: string,
    @Param('userId') userId: string,
    @Body() input: UpdateMemberDto,
  ) {
    return this.access.updateMember(req.user.id, id, userId, input);
  }
  @Get('audit') audit(@Req() req: Request, @Param('businessId') id: string) {
    return this.access.audit(req.user.id, id);
  }
}
