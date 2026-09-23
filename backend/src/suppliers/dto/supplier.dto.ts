import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, ValidateIf, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const supplierStatuses = ['ACTIVE', 'INACTIVE'] as const;

export class CreateSupplierDto {
  @ApiProperty() @IsString() @MinLength(1) @Matches(/\S/) @MaxLength(160) name!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(160) contactName?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsEmail() @MaxLength(160) email?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) address?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(1) @Matches(/\S/) @MaxLength(160) name?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(160) contactName?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsEmail() @MaxLength(160) email?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional({ enum: supplierStatuses }) @ValidateIf((_object, value) => value !== undefined) @IsIn(supplierStatuses) status?: (typeof supplierStatuses)[number];
}

export class SupplierListQueryDto {
  @ApiPropertyOptional({ description: 'Search by name, contact name, phone, or email.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: supplierStatuses, default: 'ACTIVE' }) @ValidateIf((_object, value) => value !== undefined) @IsIn(supplierStatuses) status?: (typeof supplierStatuses)[number];
}
