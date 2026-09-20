import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, ValidateIf, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export const customerStatuses = ['ACTIVE', 'INACTIVE'] as const;

export class CreateCustomerDto {
  @ApiProperty() @IsString() @MinLength(1) @Matches(/\S/, { message: 'name must contain a non-whitespace character' }) @MaxLength(160) name!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(160) contactName?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsEmail() @MaxLength(160) email?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) address?: string;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(1) @Matches(/\S/, { message: 'name must contain a non-whitespace character' }) @MaxLength(160) name?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(160) contactName?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsEmail() @MaxLength(160) email?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional({ enum: customerStatuses }) @ValidateIf((_object, value) => value !== undefined) @IsIn(customerStatuses) status?: (typeof customerStatuses)[number];
}

export class CustomerListQueryDto {
  @ApiPropertyOptional({ description: 'Search by name, contact name, phone, or email.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: customerStatuses, default: 'ACTIVE' }) @ValidateIf((_object, value) => value !== undefined) @IsIn(customerStatuses) status?: (typeof customerStatuses)[number];
}
