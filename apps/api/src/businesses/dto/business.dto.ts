import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, ValidateIf, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsPhone } from '../../common/validators/is-phone.js';
import { IsGstStateCode, IsGstin } from '../../common/validators/is-gstin.js';

export class CreateBusinessDto {
  @ApiProperty() @IsString() @MinLength(2) @Matches(/\S/) @MaxLength(120) name!: string;
  @ApiProperty() @IsString() @MinLength(2) @Matches(/\S/) @MaxLength(80) slug!: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsEmail() email?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @IsPhone() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) address?: string;
}

export class UpdateBusinessDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @Matches(/\S/) @MaxLength(120) name?: string;
  // An empty string clears the email, as it does for the other optional fields.
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined && value !== '') @IsEmail() email?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @IsPhone() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(300) address?: string;
  // Normalised to uppercase and checked against the shared prefix rule by the service.
  @ApiPropertyOptional({ description: 'Sales invoice prefix: 1 to 3 letters or digits, e.g. INV.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(10) invoicePrefix?: string;
  @ApiPropertyOptional({ description: 'Purchase number prefix: 1 to 3 letters or digits, e.g. PUR.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(10) purchasePrefix?: string;
  @ApiPropertyOptional({ description: 'Shop GSTIN; an empty string clears it. Sets the state when stateCode is not sent.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @IsGstin() gstin?: string;
  @ApiPropertyOptional({ description: 'GST state code such as "27"; must match the GSTIN when both are set.' }) @ValidateIf((_object, value) => value !== undefined) @IsString() @IsGstStateCode() stateCode?: string;
}

export class AddBusinessUserDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty({ enum: ['ADMIN', 'MEMBER'] }) @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,49}$/) role!: string;
}

export class UpdateBusinessUserDto {
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER'] }) @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,49}$/) role!: string;
}

export class UpdatePricingAccessDto {
  @ApiProperty({ description: 'Allow MEMBER users to see product and purchase costs.' })
  @IsBoolean()
  membersCanViewPurchasePrice!: boolean;
}
