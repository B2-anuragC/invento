import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
export class PeriodDto {
  @IsOptional() @IsDateString({ strict: true }) from?: string;
  @IsOptional() @IsDateString({ strict: true }) to?: string;
}
export class AuditQueryDto extends PageDto {
  @IsOptional() @IsString() @MaxLength(100) actorId?: string;
  @IsOptional() @IsIn(['business', 'user']) targetType?: string;
  @IsOptional() @IsString() @MaxLength(100) targetId?: string;
  @IsOptional() @IsString() @MaxLength(100) businessId?: string;
  @IsOptional() @IsString() @MaxLength(100) action?: string;
}
export class ReasonDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(5)
  @MaxLength(500)
  reason: string;
  @Transform(({ obj }) => obj.confirmed) @Equals(true) confirmed: boolean;
}
export class StatusDto extends ReasonDto {
  // Disable implicit boolean coercion: the string "false" must not become true.
  @Transform(({ obj }) => obj.isActive) @IsBoolean() isActive: boolean;
}
