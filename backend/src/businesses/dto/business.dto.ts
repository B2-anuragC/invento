import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBusinessDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) slug!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) address?: string;
}

export class UpdateBusinessDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) address?: string;
}

export class AddBusinessUserDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty({ enum: ['ADMIN', 'MEMBER'] }) @IsIn(['ADMIN', 'MEMBER']) role!: 'ADMIN' | 'MEMBER';
}

export class UpdateBusinessUserDto {
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER'] }) @IsIn(['OWNER', 'ADMIN', 'MEMBER']) role!: 'OWNER' | 'ADMIN' | 'MEMBER';
}
