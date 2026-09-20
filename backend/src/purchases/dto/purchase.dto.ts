import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsDecimal, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

const quantityOptions = { decimal_digits: '0,3', force_decimal: false };
const decimalOptions = { decimal_digits: '0,2', force_decimal: false };

export class PurchaseItemDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ example: '50.000' }) @IsDecimal(quantityOptions) @Matches(/^\d+(?:\.\d{1,3})?$/) quantity!: string;
  @ApiProperty({ example: '40.00' }) @IsDecimal(decimalOptions) @Matches(/^\d+(?:\.\d{1,2})?$/) purchasePrice!: string;
}

export class CreatePurchaseDto {
  @ApiProperty() @IsString() supplierId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) invoiceNumber?: string;
  @ApiProperty({ example: '2026-01-15' }) @IsDateString() purchaseDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}

export class UpdatePurchaseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) invoiceNumber?: string;
  @ApiPropertyOptional({ example: '2026-01-15' }) @IsOptional() @IsDateString() purchaseDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class PurchaseListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() supplierId?: string;
  @ApiPropertyOptional({ description: 'Filter by invoice number (partial match).' }) @IsOptional() @IsString() @MaxLength(80) search?: string;
}
