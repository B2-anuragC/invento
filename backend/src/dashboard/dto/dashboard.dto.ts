import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, Matches, Max, Min, ValidateIf } from 'class-validator';

export class DashboardRangeDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Inclusive Asia/Kolkata date; defaults to 29 days before to.' })
  @ValidateIf((_object, value) => value !== undefined) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Inclusive Asia/Kolkata date; defaults to today. Maximum range: 366 days.' })
  @ValidateIf((_object, value) => value !== undefined) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true })
  to?: string;
}

export class DashboardPageDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @ValidateIf((_object, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 100000 })
  @ValidateIf((_object, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(0) @Max(100000)
  offset: number = 0;
}

export class DashboardTopProductsDto extends DashboardRangeDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @ValidateIf((_object, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 10;
}
