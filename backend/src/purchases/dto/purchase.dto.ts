import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsDecimal, ValidateIf, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

const quantityOptions = { decimal_digits: '0,3', force_decimal: false };
const decimalOptions = { decimal_digits: '0,2', force_decimal: false };

export class PurchaseItemDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ example: '50.000' }) @IsDecimal(quantityOptions) @Matches(/^\d{1,9}(?:\.\d{1,3})?$/) quantity!: string;
  @ApiProperty({ example: '40.00' }) @IsDecimal(decimalOptions) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) purchasePrice!: string;
}

export class CreatePurchaseDto {
  @ApiProperty() @IsString() supplierId!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) invoiceNumber?: string;
  @ApiProperty({ example: '2026-01-15' }) @IsDateString({ strict: true }) purchaseDate!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(500) note?: string;
  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}

export class UpdatePurchaseDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) invoiceNumber?: string;
  @ApiPropertyOptional({ example: '2026-01-15' }) @ValidateIf((_object, value) => value !== undefined) @IsDateString({ strict: true }) purchaseDate?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(500) note?: string;
}

export class PurchaseListQueryDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() supplierId?: string;
  @ApiPropertyOptional({ description: 'Filter by invoice number (partial match).' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) search?: string;
}
