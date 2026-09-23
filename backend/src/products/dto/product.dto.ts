import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsIn, ValidateIf, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export const productUnits = ['PIECE', 'KG', 'GRAM', 'LITRE', 'MILLILITRE', 'METRE', 'PACK', 'BOX', 'DOZEN', 'OTHER'] as const;
export const productStatuses = ['ACTIVE', 'INACTIVE'] as const;

const decimalOptions = { decimal_digits: '0,2', force_decimal: false };
const quantityOptions = { decimal_digits: '0,3', force_decimal: false };

export class CreateProductDto {
  @ApiProperty() @IsString() @MinLength(1) @Matches(/\S/) @MaxLength(160) name!: string;
  @ApiProperty({ example: 'RICE-001' }) @IsString() @MinLength(1) @MaxLength(64) @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/) sku!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(100) barcode?: string;
  @ApiProperty({ enum: productUnits }) @IsIn(productUnits) unit!: (typeof productUnits)[number];
  @ApiProperty({ example: '45.00' }) @IsDecimal(decimalOptions) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) purchasePrice!: string;
  @ApiProperty({ example: '55.00' }) @IsDecimal(decimalOptions) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) sellingPrice!: string;
  @ApiProperty({ example: '10.000' }) @IsDecimal(quantityOptions) @Matches(/^\d{1,9}(?:\.\d{1,3})?$/) minimumStock!: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(1) @Matches(/\S/) @MaxLength(160) name?: string;
  @ApiPropertyOptional({ example: 'RICE-001' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(1) @MaxLength(64) @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/) sku?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(100) barcode?: string;
  @ApiPropertyOptional({ enum: productUnits }) @ValidateIf((_object, value) => value !== undefined) @IsIn(productUnits) unit?: (typeof productUnits)[number];
  @ApiPropertyOptional({ example: '45.00' }) @ValidateIf((_object, value) => value !== undefined) @IsDecimal(decimalOptions) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) purchasePrice?: string;
  @ApiPropertyOptional({ example: '55.00' }) @ValidateIf((_object, value) => value !== undefined) @IsDecimal(decimalOptions) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) sellingPrice?: string;
  @ApiPropertyOptional({ example: '10.000' }) @ValidateIf((_object, value) => value !== undefined) @IsDecimal(quantityOptions) @Matches(/^\d{1,9}(?:\.\d{1,3})?$/) minimumStock?: string;
  @ApiPropertyOptional({ enum: productStatuses }) @ValidateIf((_object, value) => value !== undefined) @IsIn(productStatuses) status?: (typeof productStatuses)[number];
}

export class ProductListQueryDto {
  @ApiPropertyOptional({ description: 'Search name, SKU, or barcode.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: productStatuses, default: 'ACTIVE' }) @ValidateIf((_object, value) => value !== undefined) @IsIn(productStatuses) status?: (typeof productStatuses)[number];
}
