import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { AccessTokenGuard } from './auth.guard.js';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto); }
  @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto); }
  @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken); }
  @Post('logout') logout(@Body() dto: RefreshDto) { return this.auth.logout(dto.refreshToken); }

  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  @Get('me')
  async me(@Req() req: Request) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, phone: true, avatarUrl: true, isActive: true } });
    if (!user?.isActive) throw new UnauthorizedException('User account is inactive or does not exist.');
    return user;
  }
}
