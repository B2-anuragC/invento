import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsDecimal, IsEnum, IsString, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
export class TransactionFinanceDto {
  @ApiPropertyOptional({ description: 'Reject a queued transaction if server item rates change its total.' })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^\d{1,12}(?:\.\d{1,2})?$/)
  expectedTotal?: string;

  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined) @IsDecimal({ decimal_digits: '0,2' }) @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) amountPaid?: string;
  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined) @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate?: string;
  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined) @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) requestId?: string;
}
export class CancelTransactionDto {
  @ApiProperty({ description: 'Why the bill is cancelled; kept with the bill.' }) @IsString() @MaxLength(200) @Matches(/\S/, { message: 'Enter why this bill is cancelled.' }) reason!: string;
  @ApiPropertyOptional({ enum: PaymentMethod, description: 'How money already paid is refunded; defaults to how it was paid.' }) @ValidateIf((_o, v) => v !== undefined) @IsEnum(PaymentMethod) refundMethod?: PaymentMethod;
}

export class RecordPaymentDto {
  @ApiProperty() @IsDecimal({ decimal_digits: '0,2' }) @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) amount!: string;
  @ApiProperty() @IsEnum(PaymentMethod) method!: PaymentMethod;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) requestId!: string;
  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined) @IsDecimal({ decimal_digits: '0,2' }) @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) openingAmountPaid?: string;
  @ApiPropertyOptional({ description: 'When the money was received or paid; defaults to now. Not before the bill date or in the future.' }) @ValidateIf((_o, v) => v !== undefined) @IsDateString({ strict: true }) paidAt?: string;
}

export class ReturnItemDto {
  @ApiProperty({ description: 'The bill line (sale item or purchase item) being returned.' }) @IsString() @MaxLength(64) itemId!: string;
  @ApiProperty({ example: '2', description: 'Quantity returned, in the line\'s unit; at most what was sold or bought less earlier returns.' }) @IsDecimal({ decimal_digits: '0,3', force_decimal: false }) @Matches(/^\d{1,9}(?:\.\d{1,3})?$/) quantity!: string;
}

export class CreateReturnDto {
  @ApiProperty({ description: 'Makes a retried request safe: the same requestId records the return once.' }) @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) requestId!: string;
  @ApiProperty({ type: [ReturnItemDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ReturnItemDto) items!: ReturnItemDto[];
  @ApiPropertyOptional({ description: 'Why the goods came back; printed on the note.' }) @ValidateIf((_o, v) => v !== undefined) @IsString() @MaxLength(200) reason?: string;
  @ApiPropertyOptional({ enum: PaymentMethod, description: 'How any refund is paid; defaults to how the bill was paid. The return first reduces what is still owed.' }) @ValidateIf((_o, v) => v !== undefined) @IsEnum(PaymentMethod) refundMethod?: PaymentMethod;
}
