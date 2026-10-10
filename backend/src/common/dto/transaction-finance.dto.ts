import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsDecimal, IsEnum, IsString, Matches, ValidateIf } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
export class TransactionFinanceDto {
  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined) @IsDecimal({ decimal_digits: '0,2' }) @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) amountPaid?: string;
  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined) @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate?: string;
  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined) @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) requestId?: string;
}
export class RecordPaymentDto {
  @ApiProperty() @IsDecimal({ decimal_digits: '0,2' }) @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) amount!: string;
  @ApiProperty() @IsEnum(PaymentMethod) method!: PaymentMethod;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) requestId!: string;
  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined) @IsDecimal({ decimal_digits: '0,2' }) @Matches(/^\d{1,12}(?:\.\d{1,2})?$/) openingAmountPaid?: string;
}
