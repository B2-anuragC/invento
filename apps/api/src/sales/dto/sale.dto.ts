import { TransactionFinanceDto } from '../../common/dto/transaction-finance.dto.js';
import { DISCOUNT_AMOUNT_RULE_MESSAGE, DISCOUNT_PERCENT_RULE_MESSAGE } from '@invento/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsInt, Max, Min, IsIn, IsArray, IsDateString, IsDecimal, IsEnum, ValidateIf, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

const quantityOptions = { decimal_digits: '0,3', force_decimal: false };
const decimalOptions = { decimal_digits: '0,2', force_decimal: false };

export class SaleItemDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(64) sellingOptionId?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsIn(['PIECE', 'KG', 'GRAM', 'LITRE', 'MILLILITRE', 'METRE', 'SQUARE_FOOT', 'FOOT', 'PACK', 'BOX', 'DOZEN', 'OTHER']) unit?: string;
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ example: '50.000' }) @IsDecimal(quantityOptions) @Matches(/^\d{1,9}(?:\.\d{1,3})?$/) quantity!: string;
  @ApiProperty({ example: '40.00' }) @IsDecimal(decimalOptions) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) sellingPrice!: string;
}

export class CreateSaleDto extends TransactionFinanceDto {
  @ApiPropertyOptional({ description: "Optional JPEG bill/reference photo, up to 2 MB." }) @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(2800000) @Matches(/^(?:data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}|\/files\/[a-f0-9]{64}\/original)$/) referenceImage?: string;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @ApiProperty() @IsString() customerId!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) invoiceNumber?: string;
  @ApiProperty({ example: '2026-01-15' }) @IsDateString({ strict: true }) saleDate!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(500) note?: string;
  @ApiPropertyOptional({ description: 'Bill discount in rupees, up to the subtotal. It lowers the taxable value and is split across the lines.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^\d{1,12}(?:\.\d{1,2})?$/, { message: DISCOUNT_AMOUNT_RULE_MESSAGE }) discountAmount?: string;
  @ApiPropertyOptional({ description: 'Bill discount as a percentage of the subtotal; send discountAmount or this, not both.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^\d{1,3}(?:\.\d{1,2})?$/, { message: DISCOUNT_PERCENT_RULE_MESSAGE }) discountPercent?: string;
  // The raw value: implicit conversion would turn the string "false" into true.
  @ApiPropertyOptional({ description: 'Charge GST at each product\'s rate (needs the shop GSTIN). False: tax 0 on every line and the sale is a bill of supply. Missing: charged as before, for bills queued by older apps.' }) @ValidateIf((_object, value) => value !== undefined) @Transform(({ obj, key }) => obj[key]) @IsBoolean() chargeGst?: boolean;
  @ApiProperty({ type: [SaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];
}

export class EditSaleItemsDto {
  @ApiProperty({ description: 'Makes a retried request safe: the same requestId edits the bill once.' }) @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) requestId!: string;
  @ApiPropertyOptional({ description: 'The bill revision the edit was made from; refused (409) if the bill changed since.' }) @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(1) @Max(2147483647) revision?: number;
  @ApiProperty({ description: 'Why the bill is edited; kept with the bill.' }) @IsString() @MaxLength(200) @Matches(/\S/, { message: 'Enter why this bill is edited.' }) reason!: string;
  @ApiProperty({ description: 'Charge GST at each product\'s rate (needs the shop GSTIN).' }) @Transform(({ obj, key }) => obj[key]) @IsBoolean() chargeGst!: boolean;
  @ApiPropertyOptional({ description: 'Bill discount in rupees, up to the subtotal.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^\d{1,12}(?:\.\d{1,2})?$/, { message: DISCOUNT_AMOUNT_RULE_MESSAGE }) discountAmount?: string;
  @ApiPropertyOptional({ description: 'Bill discount as a percentage of the subtotal; send discountAmount or this, not both.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^\d{1,3}(?:\.\d{1,2})?$/, { message: DISCOUNT_PERCENT_RULE_MESSAGE }) discountPercent?: string;
  @ApiPropertyOptional({ description: 'The new total the person saw; refused (409) if prices changed it.' }) @ValidateIf((_object, value) => value !== undefined) @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) expectedTotal?: string;
  @ApiPropertyOptional({ enum: PaymentMethod, description: 'How money paid above the new total is refunded; defaults to how the bill was paid.' }) @ValidateIf((_object, value) => value !== undefined) @IsEnum(PaymentMethod) refundMethod?: PaymentMethod;
  @ApiProperty({ type: [SaleItemDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SaleItemDto) items!: SaleItemDto[];
}

export class UpdateSaleDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) invoiceNumber?: string;
  @ApiPropertyOptional({ example: '2026-01-15' }) @ValidateIf((_object, value) => value !== undefined) @IsDateString({ strict: true }) saleDate?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(500) note?: string;
}

export class SaleListQueryDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() customerId?: string;
  @ApiPropertyOptional({ description: 'Filter by invoice number (partial match).' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) search?: string;
}
