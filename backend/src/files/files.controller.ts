import { requireBusinessMembership, requireBusinessPermission, supportAccess } from '../auth/business-access.js';
import { BusinessPermissionGuard, BusinessAccessInterceptor } from '../access/business-permission.guard.js';
import { UseInterceptors } from '@nestjs/common';
import { FileJobsService } from './file-jobs.service.js';
import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
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
@UseInterceptors(BusinessAccessInterceptor)
@UseGuards(AccessTokenGuard, BusinessPermissionGuard)
export class FilesController {
  constructor(private readonly files: FilesService, private readonly prisma: PrismaService, private readonly jobs: FileJobsService) {}
  private async membership(req: Request) {
    const businessId = req.header('X-Business-Id');
    if (!businessId) throw new BadRequestException('Select a business.');
    return requireBusinessMembership(this.prisma, req.user.id, businessId);
  }

  private async uploadPermission(req: Request, kind: UploadKind) {
    const domain = ({ product: 'products', customer: 'customers', sale: 'sales', purchase: 'purchases' } as const)[kind];
    if (!domain) throw new BadRequestException('Invalid upload kind.');
    const membership = await requireBusinessPermission(this.prisma, req.user.id, String(req.header('X-Business-Id')), 'files.upload');
    if (!membership.permissions.includes(`${domain}.create`) && !membership.permissions.includes(`${domain}.update`)) throw new ForbiddenException('No authority to upload for this resource.');
  }
  @Post()
  async upload(@Req() req: Request, @Body() dto: UploadFileDto) {
    const membership = await this.membership(req);
    await this.uploadPermission(req, dto.kind);
    return this.jobs.upload(membership.businessId, dto, dto.kind, req.user.id, supportAccess.getStore()?.auditId);
  }
  @Post('jobs')
  @HttpCode(202)
  async enqueue(@Req() req: Request, @Body() dto: UploadFileDto) {
    const membership = await this.membership(req);
    await this.uploadPermission(req, dto.kind);
    return this.jobs.enqueue(membership.businessId, dto, dto.kind, req.user.id, supportAccess.getStore()?.auditId);
  }
  @Get('jobs/:jobId')
  async jobStatus(@Req() req: Request, @Param('jobId') jobId: string) {
    const membership = await requireBusinessPermission(this.prisma, req.user.id, String(req.header('X-Business-Id')), 'files.upload');
    const status = await this.jobs.status(membership.businessId, jobId);
    await this.uploadPermission(req, status.kind);
    return status;
  }
  @Get(':id/:variant')
  async download(@Req() req: Request, @Param('id') id: string, @Param('variant') variant: string, @Res() res: Response) {
    const membership = await requireBusinessPermission(this.prisma, req.user.id, String(req.header('X-Business-Id')), 'files.view');
    const result = await this.files.read(membership.businessId, id, variant);
    const domain = ({ product: 'products', customer: 'customers', sale: 'sales', purchase: 'purchases' } as const)[result.manifest.kind];
    if (!domain || !membership.permissions.includes(`${domain}.view`)) throw new ForbiddenException('Resource access is unavailable.');
    if (result.manifest.kind === 'purchase' && !membership.permissions.includes('pricing.view')) {
      throw new ForbiddenException('Purchase attachments are restricted.');
    }
    const name = result.manifest.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.set({ 'Content-Type': result.mimeType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Disposition': `${result.mimeType.startsWith('image/') ? 'inline' : 'attachment'}; filename="${name}"` });
    res.send(result.data);
  }
}
