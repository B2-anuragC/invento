import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const adjustmentTypes = ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRED', 'RETURN_IN', 'RETURN_OUT'] as const;

const quantityOptions = { decimal_digits: '0,3', force_decimal: false };

export class OpeningStockDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ example: '100.000' }) @IsDecimal(quantityOptions) @Matches(/^\d+(?:\.\d{1,3})?$/) quantity!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class InventoryAdjustmentDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ enum: adjustmentTypes }) @IsIn(adjustmentTypes) type!: (typeof adjustmentTypes)[number];
  @ApiProperty({ example: '5.000' }) @IsDecimal(quantityOptions) @Matches(/^\d+(?:\.\d{1,3})?$/) quantity!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}
