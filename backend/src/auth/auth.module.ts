import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccessTokenGuard } from './auth.guard.js';

@Module({ controllers: [AuthController], providers: [AuthService, AccessTokenGuard], exports: [AuthService, AccessTokenGuard] })
export class AuthModule {}
