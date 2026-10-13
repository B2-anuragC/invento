import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AccessTokenGuard } from '../auth/auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FilesService, type UploadKind } from './files.service.js';
class UploadFileDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsString() @MinLength(1) @MaxLength(120) mimeType!: string;
  @IsString() @MaxLength(13981016) @Matches(/^[A-Za-z0-9+/]+={0,2}$/) base64!: string;
  @IsIn(['product', 'customer', 'sale', 'purchase']) kind!: UploadKind;
}
@Controller('files')
@UseGuards(AccessTokenGuard)
export class FilesController {
  constructor(private readonly files: FilesService, private readonly prisma: PrismaService) {}
  private async membership(req: Request) {
    const businessId = req.header('X-Business-Id');
    if (!businessId) throw new BadRequestException('Select a business.');
    const membership = await this.prisma.businessUser.findUnique({ where: { businessId_userId: { businessId, userId: req.user.id } } });
    if (!membership?.isActive) throw new ForbiddenException('You do not have access to this business.');
    return membership;
  }
  @Post()
  async upload(@Req() req: Request, @Body() dto: UploadFileDto) {
    const membership = await this.membership(req);
    if (!['OWNER', 'ADMIN'].includes(membership.role)) throw new ForbiddenException('Only owners and administrators can upload files.');
    return this.files.store(membership.businessId, dto, dto.kind);
  }
  @Get(':id/:variant')
  async download(@Req() req: Request, @Param('id') id: string, @Param('variant') variant: string, @Res() res: Response) {
    const membership = await this.membership(req);
    const result = await this.files.read(membership.businessId, id, variant);
    if (result.manifest.kind === 'purchase' && membership.role === 'MEMBER') {
      const business = await this.prisma.business.findUnique({ where: { id: membership.businessId }, select: { membersCanViewPurchasePrice: true } });
      if (business?.membersCanViewPurchasePrice === false) throw new ForbiddenException('Purchase attachments are restricted.');
    }
    const name = result.manifest.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.set({ 'Content-Type': result.mimeType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300', 'Content-Disposition': `${result.mimeType.startsWith('image/') ? 'inline' : 'attachment'}; filename="${name}"` });
    res.send(result.data);
  }
}
