import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  ValidateIf,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PERMISSIONS, type Permission } from '@invento/shared';
export class CreateRoleDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,49}$/) key!: string;
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsArray()
  @ArrayMaxSize(PERMISSIONS.length)
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  permissions!: Permission[];
}
export class UpdateRoleDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(PERMISSIONS.length)
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  permissions?: Permission[];
}
export class AddMemberDto {
  @IsEmail() email!: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,49}$/) role!: string;
}
export class UpdateMemberDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,49}$/) role?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  isActive?: boolean;
}
