import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, ValidateIf, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { IsPhone } from '../../common/validators/is-phone.js';
import { IsGstin } from '../../common/validators/is-gstin.js';

export const customerStatuses = ['ACTIVE', 'INACTIVE'] as const;

export class CreateCustomerDto {
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_o, v) => v !== undefined && v !== null) @IsString() @Matches(/^\/files\/[a-f0-9]{64}\/original$/) imageOriginal?: string | null;
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_o, v) => v !== undefined && v !== null) @IsString() @Matches(/^\/files\/[a-f0-9]{64}\/thumbnail$/) imageThumbnail?: string | null;

  @ApiProperty() @IsString() @MinLength(1) @Matches(/\S/, { message: 'name must contain a non-whitespace character' }) @MaxLength(160) name!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(160) contactName?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @IsPhone() @MaxLength(30) phone?: string;
  @ApiPropertyOptional({ description: 'GSTIN, e.g. 27AAPFU0939F1ZV. Send an empty string to clear it.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @IsGstin() gstin?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined && value !== '') @IsEmail() @MaxLength(160) email?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) address?: string;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_o, v) => v !== undefined && v !== null) @IsString() @Matches(/^\/files\/[a-f0-9]{64}\/original$/) imageOriginal?: string | null;
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_o, v) => v !== undefined && v !== null) @IsString() @Matches(/^\/files\/[a-f0-9]{64}\/thumbnail$/) imageThumbnail?: string | null;

  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(1) @Matches(/\S/, { message: 'name must contain a non-whitespace character' }) @MaxLength(160) name?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(160) contactName?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @IsPhone() @MaxLength(30) phone?: string;
  @ApiPropertyOptional({ description: 'GSTIN, e.g. 27AAPFU0939F1ZV. Send an empty string to clear it.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @IsGstin() gstin?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined && value !== '') @IsEmail() @MaxLength(160) email?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional({ enum: customerStatuses }) @ValidateIf((_object, value) => value !== undefined) @IsIn(customerStatuses) status?: (typeof customerStatuses)[number];
}

export class CustomerListQueryDto {
  @ApiPropertyOptional({ description: 'Search by name, contact name, phone, or email.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: customerStatuses, default: 'ACTIVE' }) @ValidateIf((_object, value) => value !== undefined) @IsIn(customerStatuses) status?: (typeof customerStatuses)[number];
}
