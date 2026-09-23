import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, ValidateIf, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateBusinessDto {
  @ApiProperty() @IsString() @MinLength(2) @Matches(/\S/) @MaxLength(120) name!: string;
  @ApiProperty() @IsString() @MinLength(2) @Matches(/\S/) @MaxLength(80) slug!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsEmail() email?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) address?: string;
}

export class UpdateBusinessDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @Matches(/\S/) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsEmail() email?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) address?: string;
}

export class AddBusinessUserDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty({ enum: ['ADMIN', 'MEMBER'] }) @IsIn(['ADMIN', 'MEMBER']) role!: 'ADMIN' | 'MEMBER';
}

export class UpdateBusinessUserDto {
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER'] }) @IsIn(['OWNER', 'ADMIN', 'MEMBER']) role!: 'OWNER' | 'ADMIN' | 'MEMBER';
}
