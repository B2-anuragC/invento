import { FileAttachmentDto } from '../../common/dto/file-attachment.dto.js';
import { PaymentMethod } from '@prisma/client';
import { TransactionFinanceDto } from '../../common/dto/transaction-finance.dto.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsInt, Max, Min, IsEnum, IsArray, IsDateString, IsDecimal, ValidateIf, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

const quantityOptions = { decimal_digits: '0,3', force_decimal: false };
const decimalOptions = { decimal_digits: '0,2', force_decimal: false };

export class PurchaseItemDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ example: '50.000' }) @IsDecimal(quantityOptions) @Matches(/^\d{1,9}(?:\.\d{1,3})?$/) quantity!: string;
  @ApiProperty({ example: '40.00' }) @IsDecimal(decimalOptions) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) purchasePrice!: string;
}

export class CreatePurchaseDto extends TransactionFinanceDto {
  @ApiPropertyOptional({ type: FileAttachmentDto }) @ValidateIf((_o, v) => v !== undefined) @ValidateNested() @Type(() => FileAttachmentDto) attachment?: FileAttachmentDto;
  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined) @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @ApiProperty() @IsString() supplierId!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) invoiceNumber?: string;
  @ApiProperty({ example: '2026-01-15' }) @IsDateString({ strict: true }) purchaseDate!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(500) note?: string;
  // The raw value: implicit conversion would turn the string "false" into true.
  @ApiPropertyOptional({ description: 'Whether the supplier charged GST. False: tax 0 on every line. Missing: charged at each product\'s rate as before, for bills queued by older apps.' }) @ValidateIf((_o, v) => v !== undefined) @Transform(({ obj, key }) => obj[key]) @IsBoolean() chargeGst?: boolean;
  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}

export class EditPurchaseItemsDto {
  @ApiProperty({ description: 'Makes a retried request safe: the same requestId edits the bill once.' }) @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) requestId!: string;
  @ApiPropertyOptional({ description: 'The bill revision the edit was made from; refused (409) if the bill changed since.' }) @ValidateIf((_o, v) => v !== undefined) @IsInt() @Min(1) @Max(2147483647) revision?: number;
  @ApiProperty({ description: 'Why the bill is edited; kept with the bill.' }) @IsString() @MaxLength(200) @Matches(/\S/, { message: 'Enter why this bill is edited.' }) reason!: string;
  @ApiProperty({ description: 'Whether the supplier charged GST. False: tax 0 on every line.' }) @Transform(({ obj, key }) => obj[key]) @IsBoolean() chargeGst!: boolean;
  @ApiPropertyOptional({ description: 'The new total the person saw; refused (409) if prices changed it.' }) @ValidateIf((_o, v) => v !== undefined) @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) expectedTotal?: string;
  @ApiPropertyOptional({ enum: PaymentMethod, description: 'How money paid above the new total is refunded; defaults to how the bill was paid.' }) @ValidateIf((_o, v) => v !== undefined) @IsEnum(PaymentMethod) refundMethod?: PaymentMethod;
  @ApiPropertyOptional({ description: 'The refund the person saw (0.00 when none); refused (409) if a payment recorded since changes it.' }) @ValidateIf((_o, v) => v !== undefined) @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) expectedRefund?: string;
  @ApiProperty({ type: [PurchaseItemDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PurchaseItemDto) items!: PurchaseItemDto[];
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
