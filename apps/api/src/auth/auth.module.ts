import { AccessManagementController } from '../access/access.controller.js';
import { AccessManagementService } from '../access/access.service.js';
import { BusinessPermissionGuard, BusinessAccessInterceptor } from '../access/business-permission.guard.js';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccessTokenGuard } from './auth.guard.js';

@Module({ controllers: [AccessManagementController, AuthController], providers: [AccessManagementService, BusinessPermissionGuard, BusinessAccessInterceptor, AuthService, AccessTokenGuard], exports: [AccessManagementService, BusinessPermissionGuard, BusinessAccessInterceptor, AuthService, AccessTokenGuard] })
export class AuthModule {}
